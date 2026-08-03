import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import { DRIZZLE_CLIENT, type DrizzleDb } from "../../database/drizzle.module";
import { type Room, roomMembers, rooms, users } from "../../database/schema";

export interface RoomMemberRow {
  userId: string;
  displayName: string;
  role: "owner" | "member";
  joinedAt: Date;
}

@Injectable()
export class RoomsService {
  constructor(@Inject(DRIZZLE_CLIENT) private readonly db: DrizzleDb) {}

  async create(ownerId: string, name: string): Promise<Room> {
    const [room] = await this.db.insert(rooms).values({ name, ownerId }).returning();
    await this.db.insert(roomMembers).values({ roomId: room.id, userId: ownerId, role: "owner" });
    return room;
  }

  async listForUser(userId: string): Promise<Room[]> {
    const rows = await this.db
      .select({ room: rooms })
      .from(roomMembers)
      .innerJoin(rooms, eq(roomMembers.roomId, rooms.id))
      .where(eq(roomMembers.userId, userId));
    return rows.map((r) => r.room);
  }

  async findById(roomId: string): Promise<Room> {
    const [room] = await this.db.select().from(rooms).where(eq(rooms.id, roomId)).limit(1);
    if (!room) throw new NotFoundException("Room not found");
    return room;
  }

  async listMembers(roomId: string): Promise<RoomMemberRow[]> {
    return this.db
      .select({
        userId: users.id,
        displayName: users.displayName,
        role: roomMembers.role,
        joinedAt: roomMembers.joinedAt,
      })
      .from(roomMembers)
      .innerJoin(users, eq(roomMembers.userId, users.id))
      .where(eq(roomMembers.roomId, roomId));
  }

  async isMember(roomId: string, userId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ userId: roomMembers.userId })
      .from(roomMembers)
      .where(and(eq(roomMembers.roomId, roomId), eq(roomMembers.userId, userId)))
      .limit(1);
    return !!row;
  }

  async join(roomId: string, userId: string): Promise<void> {
    const room = await this.findById(roomId);
    if (!room.isActive) throw new ForbiddenException("Room is no longer active");
    if (await this.isMember(roomId, userId)) return; // idempotent

    await this.db.insert(roomMembers).values({ roomId, userId, role: "member" });
  }

  async leave(roomId: string, userId: string): Promise<void> {
    const [membership] = await this.db
      .select()
      .from(roomMembers)
      .where(and(eq(roomMembers.roomId, roomId), eq(roomMembers.userId, userId)))
      .limit(1);

    if (!membership) throw new NotFoundException("Not a member of this room");
    // Keep MVP simple: ownership transfer/room deletion is a separate feature, not silent
    // orphaning — the owner leaves by deleting the room (not implemented yet) instead.
    if (membership.role === "owner") throw new ConflictException("Room owner cannot leave — delete the room instead");

    await this.db.delete(roomMembers).where(and(eq(roomMembers.roomId, roomId), eq(roomMembers.userId, userId)));
  }
}
