import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PublicRoomsController } from "./public-rooms.controller";
import { RoomCleanupService } from "./room-cleanup.service";
import { RoomsController } from "./rooms.controller";
import { RoomsService } from "./rooms.service";

@Module({
  imports: [AuthModule], // for JwtAuthGuard's JwtService/ConfigService deps
  controllers: [RoomsController, PublicRoomsController],
  providers: [RoomsService, RoomCleanupService],
  exports: [RoomsService],
})
export class RoomsModule {}
