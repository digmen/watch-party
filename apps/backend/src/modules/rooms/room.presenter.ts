import type { RoomDto } from "@watch-party/shared";
import type { Room } from "../../database/schema";
import type { RoomMemberRow } from "./rooms.service";

export function toRoomDto(room: Room, members: RoomMemberRow[]): RoomDto {
  return {
    id: room.id,
    name: room.name,
    ownerId: room.ownerId,
    isActive: room.isActive,
    visibility: room.visibility,
    hasPassword: room.passwordHash !== null,
    queueAddPolicy: room.queueAddPolicy,
    createdAt: room.createdAt.toISOString(),
    members: members.map((m) => ({
      userId: m.userId,
      displayName: m.displayName,
      role: m.role,
      joinedAt: m.joinedAt.toISOString(),
    })),
  };
}
