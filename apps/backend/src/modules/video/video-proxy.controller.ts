import { createReadStream } from "node:fs";
import { Body, Controller, Get, Param, Post, Res, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { FastifyReply } from "fastify";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { type AuthenticatedUser, JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
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
  ) {}

  @Post("rooms/:roomId/videos")
  async addVideo(@Param("roomId") roomId: string, @Body() dto: AddVideoDto, @CurrentUser() user: AuthenticatedUser) {
    const asset = await this.videos.addVideoToRoom(roomId, dto.sourceUrl, user.sub);
    return { video: toVideoAssetDto(asset) };
  }

  @Get("rooms/:roomId/videos/latest")
  async getLatestForRoom(@Param("roomId") roomId: string) {
    const asset = await this.videos.getLatestForRoom(roomId);
    return { video: asset ? toVideoAssetDto(asset) : null };
  }

  @Get("video/assets/:id")
  async getStatus(@Param("id") id: string) {
    const asset = await this.videos.getAsset(id);
    return { video: toVideoAssetDto(asset) };
  }

  @Throttle({ default: { limit: 300, ttl: 60_000 } })
  @Get("video/proxy/:id/playlist.m3u8")
  async getPlaylist(@Param("id") id: string, @Res() reply: FastifyReply) {
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
  async getSegment(@Param("id") id: string, @Param("token") token: string, @Res() reply: FastifyReply) {
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
