import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ChatModule } from "../chat/chat.module";
import { RoomsModule } from "../rooms/rooms.module";
import { PlaybackStateService } from "./playback-state.service";
import { PresenceService } from "./presence.service";
import { RoomGateway } from "./room.gateway";
import { StallService } from "./stall.service";

@Module({
  imports: [AuthModule, RoomsModule, ChatModule],
  providers: [RoomGateway, PresenceService, PlaybackStateService, StallService],
  // Exported so VideoModule can announce video changes into a room. Safe direction: the gateway
  // knows nothing about videos, so nothing imports back this way and no cycle forms.
  exports: [RoomGateway],
})
export class GatewayModule {}
