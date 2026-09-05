import { createReadStream } from "node:fs";
import { Body, Controller, ForbiddenException, Get, Param, Post, Res, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { FastifyReply } from "fastify";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { FullAccountGuard } from "../../common/guards/full-account.guard";
import { type AuthenticatedUser, JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RoomsService } from "../rooms/rooms.service";
import { AddVideoDto } from "./dto/add-video.dto";
import { toVideoAssetDto } from "./video.presenter";
import { VideoService } from "./video.service";
import { VideoCacheService } from "./video-cache.service";

// Rate limiting here is tighter than the app-wide default (see app.module.ts) — this is exactly
// the endpoint the plan flagged as needing extra governance, since a Cloudflare Quick Tunnel caps
// in-flight requests at 200: many small HLS segment GETs across a few active rooms can burn
// through that fast without a guard.
@Controller()
@UseGuards(JwtAuthGuard)
export class VideoProxyController {
  constructor(
    private readonly videos: VideoService,
    private readonly cache: VideoCacheService,
    private readonly rooms: RoomsService,
  ) {}

  // Membership is checked here, not just at the room level: without it any authenticated user who
  // learns a room UUID could attach a video to someone else's room — and since `sourceUrl` is
  // fetched server-side, that made this endpoint a way to aim the backend at arbitrary hosts.
  // AddVideoSchema now rejects private/internal targets, and this rejects non-members.
  private async assertMember(roomId: string, userId: string): Promise<void> {
    if (!(await this.rooms.isMember(roomId, userId))) throw new ForbiddenException("Not a member of this room");
  }

  // Fixes the known-limitation from README: getStatus/getPlaylist/getSegment used to check only
  // "is this a valid JWT", not "is this asset one of the caller's rooms" — so anyone who learned
  // or guessed an asset UUID (36 chars, but leaked via e.g. a shared screenshot, a referrer header,
  // browser history, or just handed room to room since assets are deduped by sourceUrlHash) could
  // stream it forever. An asset can legitimately sit in more than one room (same source URL added
  // twice = same row, see addVideoToRoom's dedup), so membership is "is the caller in ANY room that
  // currently has this asset attached", not "is there one owning room".
  private async assertAssetAccessible(assetId: string, userId: string): Promise<void> {
    const roomIds = await this.videos.roomIdsForAsset(assetId);
    const memberships = await Promise.all(roomIds.map((roomId) => this.rooms.isMember(roomId, userId)));
    if (!memberships.some(Boolean)) throw new ForbiddenException("Not a member of any room with this video");
  }

  // Guests watch what the host picked; they don't get to point the server at new URLs. This also
  // keeps the fetch-a-user-supplied-URL surface behind a real account.
  @Post("rooms/:roomId/videos")
  @UseGuards(FullAccountGuard)
  async addVideo(@Param("roomId") roomId: string, @Body() dto: AddVideoDto, @CurrentUser() user: AuthenticatedUser) {
    await this.assertMember(roomId, user.sub);
    const asset = await this.videos.addVideoToRoom(roomId, dto.sourceUrl, user.sub);
    return { video: toVideoAssetDto(asset) };
  }

  // Also member-gated: this hands out the asset UUID, which is the only thing standing between a
  // stranger and the playlist/segment routes below (those are room-agnostic by design — see the
  // known-limitation note in README).
  @Get("rooms/:roomId/videos/latest")
  async getLatestForRoom(@Param("roomId") roomId: string, @CurrentUser() user: AuthenticatedUser) {
    await this.assertMember(roomId, user.sub);
    const asset = await this.videos.getLatestForRoom(roomId);
    return { video: asset ? toVideoAssetDto(asset) : null };
  }

  @Get("video/assets/:id")
  async getStatus(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    await this.assertAssetAccessible(id, user.sub);
    const asset = await this.videos.getAsset(id);
    return { video: toVideoAssetDto(asset) };
  }

  @Throttle({ default: { limit: 300, ttl: 60_000 } })
  @Get("video/proxy/:id/playlist.m3u8")
  async getPlaylist(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser, @Res() reply: FastifyReply) {
    await this.assertAssetAccessible(id, user.sub);
    const asset = await this.videos.getAsset(id);
    await this.videos.touchLastAccessed(id);
    const text = await this.cache.readPlaylist(asset.sourceUrlHash);
    reply.type("application/vnd.apple.mpegurl").send(text);
  }

  // No `/segment/` path component: the HLS manifest (both the ffmpeg-remuxed one and the
  // rewritten HLS/DASH-passthrough one — see video-cache.service.ts) references segments by
  // *bare* relative filename (`000.ts`, or a hashed token). A browser resolves that relative
  // reference against the manifest's own URL per plain RFC 3986 rules — i.e. sibling of
  // `playlist.m3u8`, not under an extra `/segment/` segment — so the route has to match that
  // exact shape or every real hls.js-driven fetch 404s even though a manually-constructed test
  // URL to `/segment/:token` would "work" in isolation. `playlist.m3u8` above is registered first,
  // so that exact literal path still wins over this param route for the manifest itself.
  @Throttle({ default: { limit: 300, ttl: 60_000 } })
  @Get("video/proxy/:id/:token")
  async getSegment(
    @Param("id") id: string,
    @Param("token") token: string,
    @CurrentUser() user: AuthenticatedUser,
    @Res() reply: FastifyReply,
  ) {
    // Checked per segment, not once per playlist fetch: hls.js keeps pulling segments for as long
    // as it holds a playlist that was already resolved, and a captured segment URL (devtools
    // network tab, screen-share, a proxy log) must stop working the moment membership does, not
    // linger until the next playlist reload. The extra query is one indexed lookup — real cost
    // only if this endpoint ever gets busy, which it doesn't yet (see 2026-09-05 usage audit).
    await this.assertAssetAccessible(id, user.sub);
    const asset = await this.videos.getAsset(id);
    await this.videos.touchLastAccessed(id);

    // direct_mp4 assets are fully remuxed up front by ffmpeg (all segments already on disk);
    // hls/dash assets are a lazy passthrough cache — fetch-on-miss from the origin.
    const segmentPath =
      asset.kind === "direct_mp4"
        ? `${this.cache.dirFor(asset.sourceUrlHash)}/${token}`
        : await this.cache.getOrFetchSegment(asset.sourceUrlHash, token);

    reply.type("video/mp2t").send(createReadStream(segmentPath));
  }
}
