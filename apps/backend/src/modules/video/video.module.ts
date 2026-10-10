import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { GatewayModule } from "../gateway/gateway.module";
import { RoomsModule } from "../rooms/rooms.module";
import { VideoService } from "./video.service";
import { VideoCacheService } from "./video-cache.service";
import { VideoCacheCleanupService } from "./video-cache-cleanup.service";
import { VideoPrefetchProcessor } from "./video-prefetch.processor";
import { VideoProxyController } from "./video-proxy.controller";
import { VideoResolverService } from "./video-resolver.service";
import { YtDlpUpdaterService } from "./ytdlp-updater.service";

@Module({
  imports: [AuthModule, RoomsModule, GatewayModule, BullModule.registerQueue({ name: "video-prefetch" })],
  controllers: [VideoProxyController],
  providers: [
    VideoResolverService,
    VideoCacheService,
    VideoCacheCleanupService,
    VideoPrefetchProcessor,
    VideoService,
    YtDlpUpdaterService,
  ],
})
export class VideoModule {}
