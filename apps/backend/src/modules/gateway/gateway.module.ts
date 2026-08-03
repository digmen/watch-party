import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ChatModule } from "../chat/chat.module";
import { RoomsModule } from "../rooms/rooms.module";
import { PlaybackStateService } from "./playback-state.service";
import { PresenceService } from "./presence.service";
import { RoomGateway } from "./room.gateway";

@Module({
  imports: [AuthModule, RoomsModule, ChatModule],
  providers: [RoomGateway, PresenceService, PlaybackStateService],
})
export class GatewayModule {}
