import { Controller, ForbiddenException, Get, Param, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { type AuthenticatedUser, JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RoomsService } from "../rooms/rooms.service";
import { toChatMessageDto } from "./chat.presenter";
import { ChatService } from "./chat.service";

@Controller("rooms/:roomId/messages")
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(
    private readonly chat: ChatService,
    private readonly rooms: RoomsService,
  ) {}

  @Get()
  async list(@Param("roomId") roomId: string, @CurrentUser() user: AuthenticatedUser) {
    if (!(await this.rooms.isMember(roomId, user.sub))) throw new ForbiddenException("Not a member of this room");
    const rows = await this.chat.listRecent(roomId);
    return { messages: rows.map(toChatMessageDto) };
  }
}
