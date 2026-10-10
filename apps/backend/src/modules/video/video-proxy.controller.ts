import { createReadStream } from "node:fs";
import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpException,
  HttpStatus,
  Inject,
  NotFoundException,
  Param,
  Post,
  Res,
  UseGuards,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { FastifyReply } from "fastify";
import type Redis from "ioredis";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { type AuthenticatedUser, JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { REDIS_CLIENT } from "../../redis/redis.module";
import { RoomsService } from "../rooms/rooms.service";
import { AddVideoDto } from "./dto/add-video.dto";
import { toVideoAssetDto } from "./video.presenter";
import { VideoService } from "./video.service";
import { VideoCacheService } from "./video-cache.service";

// Rate limiting here is tighter than the app-wide default (see app.module.ts) — this is exactly
// the endpoint the plan flagged as needing extra governance, since a Cloudflare Quick Tunnel caps
// in-flight requests at 200: many small HLS segment GETs across a few active rooms can burn
// through that fast without a guard.
const GUEST_VIDEOS_PER_HOUR = 10;

@Controller()
@UseGuards(JwtAuthGuard)
export class VideoProxyController {
  constructor(
    private readonly videos: VideoService,
    private readonly cache: VideoCacheService,
    private readonly rooms: RoomsService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  // A guest who hosts may pick the video for their own room — that is the whole point of
  // "start watching without signing up" — but never for someone else's. Because the server
  // fetches `sourceUrl` itself, anonymous hosts also get a hard per-guest hourly ceiling; real
  // accounts are not limited here.
  private async assertMayAddVideo(roomId: string, user: AuthenticatedUser): Promise<void> {
    const room = await this.rooms.findById(roomId);
    const isOwner = room.ownerId === user.sub;
    // The owner picks who may fill the queue: everybody in the room, or only themselves.
    if (!isOwner && room.queueAddPolicy === "owner") {
      throw new ForbiddenException("В этой комнате видео добавляет только хозяин");
    }
    // The server downloads whatever link it is given, so anonymous guests get an hourly ceiling;
    // registered accounts are not limited.
    if (!user.isGuest) return;
    const key = `video:add:guest:${user.sub}`;
    const count = await this.redis.incr(key);
    if (count === 1) await this.redis.expire(key, 3600);
    if (count > GUEST_VIDEOS_PER_HOUR) {
      throw new HttpException(
        "Слишком много видео за час — создайте аккаунт или подождите",
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

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

  // Real accounts and guest *owners* only; invited guests watch what the host picked.
  @Post("rooms/:roomId/videos")
  async addVideo(@Param("roomId") roomId: string, @Body() dto: AddVideoDto, @CurrentUser() user: AuthenticatedUser) {
    await this.assertMember(roomId, user.sub);
    await this.assertMayAddVideo(roomId, user);
    await this.rooms.touch(roomId);
    const { asset, becameCurrent } = await this.videos.addVideoToRoom(roomId, dto.sourceUrl, user.sub);
    return { video: toVideoAssetDto(asset), becameCurrent };
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
    // The token becomes part of a file path: only plain segment/init file names are allowed. Without
    // this, `..%2F..%2Fetc%2Fpasswd` (the router decodes it into the param) walks out of the cache.
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(token) || token.includes("..")) throw new NotFoundException();
    await this.assertAssetAccessible(id, user.sub);
    const asset = await this.videos.getAsset(id);
    await this.videos.touchLastAccessed(id);

    // direct_mp4 assets are fully remuxed up front by ffmpeg (all segments already on disk);
    // hls/dash assets are a lazy passthrough cache — fetch-on-miss from the origin.
    const segmentPath =
      asset.kind === "direct_mp4"
        ? `${this.cache.dirFor(asset.sourceUrlHash)}/${token}`
        : await this.cache.getOrFetchSegment(asset.sourceUrlHash, token);

    reply.type(/\.(m4s|mp4)$/i.test(token) ? "video/mp4" : "video/mp2t").send(createReadStream(segmentPath));
  }
}
