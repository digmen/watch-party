import { Body, Controller, Delete, ForbiddenException, Get, HttpCode, Param, Post, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { type AuthenticatedUser, JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RoomsService } from "../rooms/rooms.service";
import { ReorderQueueDto } from "./dto/reorder-queue.dto";
import { RoomQueueService } from "./room-queue.service";
import { VideoService } from "./video.service";

// The room's video queue. Reading needs membership; moving things around needs the owner — except
// that anybody may take back a video they added themselves.
@Controller("rooms/:roomId/queue")
@UseGuards(JwtAuthGuard)
export class RoomQueueController {
  constructor(
    private readonly queue: RoomQueueService,
    private readonly videos: VideoService,
    private readonly rooms: RoomsService,
  ) {}

  private async assertMember(roomId: string, userId: string): Promise<void> {
    if (!(await this.rooms.isMember(roomId, userId))) throw new ForbiddenException("Not a member of this room");
  }

  private async assertOwner(roomId: string, userId: string): Promise<void> {
    await this.assertMember(roomId, userId);
    const room = await this.rooms.findById(roomId);
    if (room.ownerId !== userId) throw new ForbiddenException("Очередью управляет хозяин комнаты");
  }

  @Get()
  async list(@Param("roomId") roomId: string, @CurrentUser() user: AuthenticatedUser) {
    await this.assertMember(roomId, user.sub);
    return { roomId, items: await this.queue.list(roomId) };
  }

  // Skip to the next queued video (it starts by itself once everyone has the first seconds).
  @Post("next")
  @HttpCode(200)
  async next(@Param("roomId") roomId: string, @CurrentUser() user: AuthenticatedUser) {
    await this.assertOwner(roomId, user.sub);
    return { advanced: await this.videos.playNext(roomId, true) };
  }

  @Post("reorder")
  @HttpCode(200)
  async reorder(@Param("roomId") roomId: string, @Body() dto: ReorderQueueDto, @CurrentUser() user: AuthenticatedUser) {
    await this.assertOwner(roomId, user.sub);
    await this.videos.reorderQueue(roomId, dto.order);
    return { ok: true };
  }

  @Post(":itemId/play")
  @HttpCode(200)
  async playNow(
    @Param("roomId") roomId: string,
    @Param("itemId") itemId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.assertOwner(roomId, user.sub);
    await this.videos.playNow(roomId, itemId);
    return { ok: true };
  }

  @Delete(":itemId")
  async remove(
    @Param("roomId") roomId: string,
    @Param("itemId") itemId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.assertMember(roomId, user.sub);
    const room = await this.rooms.findById(roomId);
    await this.videos.removeFromQueue(roomId, itemId, user.sub, room.ownerId === user.sub);
    return { ok: true };
  }
}
