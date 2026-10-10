import { Controller, Get, Param, Query } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { PublicRoomDto, RoomPreviewDto } from "@watch-party/shared";
import { RoomsService } from "./rooms.service";

// No auth on purpose: this is what the signed-out landing page and the room's password prompt
// need. It exposes only what a card needs — never member names, never the video URL.
@Controller("public/rooms")
export class PublicRoomsController {
  constructor(private readonly rooms: RoomsService) {}

  @Get()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async list(@Query("limit") limit?: string, @Query("offset") offset?: string): Promise<{ rooms: PublicRoomDto[] }> {
    const take = Math.min(Math.max(Number(limit) || 10, 1), 50);
    const skip = Math.max(Number(offset) || 0, 0);
    const rows = await this.rooms.listPublic(take, skip);
    return {
      rooms: rows.map((r) => ({
        id: r.id,
        name: r.name,
        hostName: r.hostName,
        memberCount: r.memberCount,
        videoTitle: r.videoTitle,
        requiresPassword: r.hasPassword !== null,
        createdAt: r.createdAt.toISOString(),
      })),
    };
  }

  @Get(":id")
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  async preview(@Param("id") id: string): Promise<{ room: RoomPreviewDto }> {
    const room = await this.rooms.findById(id);
    return {
      room: { id: room.id, name: room.name, visibility: room.visibility, requiresPassword: room.passwordHash !== null },
    };
  }
}
