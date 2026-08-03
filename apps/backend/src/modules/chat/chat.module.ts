import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { RoomsModule } from "../rooms/rooms.module";
import { ChatController } from "./chat.controller";
import { ChatService } from "./chat.service";

@Module({
  imports: [AuthModule, RoomsModule],
  controllers: [ChatController],
  providers: [ChatService],
  exports: [ChatService],
})
export class ChatModule {}
