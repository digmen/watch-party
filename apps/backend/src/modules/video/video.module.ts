import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { GatewayModule } from "../gateway/gateway.module";
import { RoomsModule } from "../rooms/rooms.module";
import { VideoService } from "./video.service";
import { VideoCacheService } from "./video-cache.service";
import { VideoPrefetchProcessor } from "./video-prefetch.processor";
import { VideoProxyController } from "./video-proxy.controller";
import { VideoResolverService } from "./video-resolver.service";

@Module({
  imports: [AuthModule, RoomsModule, GatewayModule, BullModule.registerQueue({ name: "video-prefetch" })],
  controllers: [VideoProxyController],
  providers: [VideoResolverService, VideoCacheService, VideoPrefetchProcessor, VideoService],
})
export class VideoModule {}
