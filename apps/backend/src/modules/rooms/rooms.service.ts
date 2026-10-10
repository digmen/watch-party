import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, count, desc, eq, gt } from "drizzle-orm";
import { DRIZZLE_CLIENT, type DrizzleDb } from "../../database/drizzle.module";
import { type Room, roomMembers, rooms, roomVideos, users, videoAssets } from "../../database/schema";

export interface RoomMemberRow {
  userId: string;
  displayName: string;
  role: "owner" | "member";
  joinedAt: Date;
}

@Injectable()
export class RoomsService {
  constructor(@Inject(DRIZZLE_CLIENT) private readonly db: DrizzleDb) {}

  async create(
    ownerId: string,
    name: string,
    options: { visibility?: "public" | "private"; password?: string } = {},
  ): Promise<Room> {
    const passwordHash = options.password ? await Bun.password.hash(options.password, { algorithm: "argon2id" }) : null;
    const [room] = await this.db
      .insert(rooms)
      .values({ name, ownerId, visibility: options.visibility ?? "private", passwordHash })
      .returning();
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

  // Throws unless the room has no password or the given one matches. Existing members are never
  // asked again — the password gates entry, not every reload.
  async assertMayEnter(room: Room, userId: string | null, password?: string): Promise<void> {
    if (!room.passwordHash) return;
    if (userId && (await this.isMember(room.id, userId))) return;
    if (!password) throw new ForbiddenException("PASSWORD_REQUIRED");
    if (!(await Bun.password.verify(password, room.passwordHash))) throw new ForbiddenException("WRONG_PASSWORD");
  }

  async join(roomId: string, userId: string, password?: string): Promise<void> {
    const room = await this.findById(roomId);
    if (!room.isActive) throw new ForbiddenException("Room is no longer active");
    if (await this.isMember(roomId, userId)) return; // idempotent
    await this.assertMayEnter(room, userId, password);

    await this.db.insert(roomMembers).values({ roomId, userId, role: "member" });
  }

  // Owner edits how the room is reachable. `password: null` clears it, `undefined` leaves it.
  async update(
    roomId: string,
    ownerId: string,
    patch: { name?: string; visibility?: "public" | "private"; password?: string | null },
  ): Promise<Room> {
    const room = await this.findById(roomId);
    if (room.ownerId !== ownerId) throw new ForbiddenException("Менять комнату может только её хозяин");
    const set: Partial<Room> = {};
    if (patch.name !== undefined) set.name = patch.name;
    if (patch.visibility !== undefined) set.visibility = patch.visibility;
    if (patch.password === null) set.passwordHash = null;
    else if (patch.password !== undefined) {
      set.passwordHash = await Bun.password.hash(patch.password, { algorithm: "argon2id" });
    }
    if (Object.keys(set).length === 0) return room;
    const [updated] = await this.db.update(rooms).set(set).where(eq(rooms.id, roomId)).returning();
    return updated;
  }

  // Newest public rooms first. Rooms older than a week are dropped so the list shows life, not an
  // archive; guests' abandoned rooms are reaped separately anyway.
  async listPublic(limit: number, offset: number) {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const rows = await this.db
      .select({
        id: rooms.id,
        name: rooms.name,
        hostName: users.displayName,
        hasPassword: rooms.passwordHash,
        createdAt: rooms.createdAt,
        memberCount: count(roomMembers.userId),
      })
      .from(rooms)
      .innerJoin(users, eq(users.id, rooms.ownerId))
      .leftJoin(roomMembers, eq(roomMembers.roomId, rooms.id))
      .where(and(eq(rooms.visibility, "public"), eq(rooms.isActive, true), gt(rooms.createdAt, since)))
      .groupBy(rooms.id, users.displayName)
      .orderBy(desc(rooms.createdAt))
      .limit(limit)
      .offset(offset);

    const withTitles = await Promise.all(
      rows.map(async (r) => {
        const [latest] = await this.db
          .select({ title: videoAssets.title, url: videoAssets.sourceUrl })
          .from(roomVideos)
          .innerJoin(videoAssets, eq(roomVideos.videoAssetId, videoAssets.id))
          .where(eq(roomVideos.roomId, r.id))
          .orderBy(desc(roomVideos.createdAt))
          .limit(1);
        return { ...r, videoTitle: latest?.title ?? null };
      }),
    );
    return withTitles;
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
