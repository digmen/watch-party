import { ForbiddenException, HttpException, HttpStatus, Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { and, eq } from "drizzle-orm";
import type Redis from "ioredis";
import type { Env } from "../../config/env.schema";
import { DRIZZLE_CLIENT, type DrizzleDb } from "../../database/drizzle.module";
import { type Room, roomMembers, rooms, type User, users } from "../../database/schema";
import { REDIS_CLIENT } from "../../redis/redis.module";
import { AuthService, type TokenPair } from "../auth/auth.service";
import { RoomsService } from "../rooms/rooms.service";
import { UsersService } from "../users/users.service";

// Per-room burst ceiling, independent of the HTTP throttler: behind cloudflared -> Traefik every
// request shares one source IP, so the IP-based limiter can't distinguish callers at all.
const GUEST_BURST_PER_MINUTE = 10;
const GUEST_START_PER_MINUTE = 30;

export interface GuestSession {
  user: User;
  room: Room;
  tokens: TokenPair | null; // null when an existing session was reused — cookies are already set
}

@Injectable()
export class GuestService {
  private readonly logger = new Logger(GuestService.name);

  constructor(
    @Inject(DRIZZLE_CLIENT) private readonly db: DrizzleDb,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly rooms: RoomsService,
    private readonly users: UsersService,
    private readonly auth: AuthService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async createSession(
    roomId: string,
    displayName: string,
    existingAccessToken?: string,
    password?: string,
  ): Promise<GuestSession> {
    // Throws NotFoundException if the room doesn't exist. The UUID *is* the invite credential, so
    // "does this room exist" is inherently observable — but guessing a v4 UUID isn't feasible.
    const room = await this.rooms.findById(roomId);
    if (!room.isActive) throw new ForbiddenException("Комната больше не активна");

    const reused = await this.reuseExistingSession(roomId, displayName, existingAccessToken, password);
    if (reused) return { user: reused, room, tokens: null };

    // Before any row is created: a wrong password must not leave a guest account behind.
    await this.rooms.assertMayEnter(room, null, password);

    await this.assertBurstAllowed(roomId);
    await this.assertRoomHasSpace(roomId);
    const name = await this.uniqueName(roomId, displayName);

    // One transaction: a failed membership insert must not leave an orphan user row behind.
    const user = await this.db.transaction(async (tx) => {
      const [created] = await tx
        .insert(users)
        .values({ email: null, passwordHash: null, displayName: name, isGuest: true, guestRoomId: roomId })
        .returning();
      await tx.insert(roomMembers).values({ roomId, userId: created.id, role: "member" }).onConflictDoNothing();
      return created;
    });

    this.logger.log(`guest ${user.id} (${name}) joined room ${roomId}`);
    return { user, room, tokens: await this.auth.issueTokenPair(user) };
  }

  // "Just start watching": a guest who hosts. "Create room" always makes a NEW room — the same visitor
  // may create as many as they like, with any (repeating) names. Protection against double submits
  // and retried requests is an idempotency key from the client, not "reuse the previous room".
  async startRoom(
    displayName: string,
    roomName: string | undefined,
    existingAccessToken?: string,
    options: { visibility?: "public" | "private"; password?: string } = {},
    idempotencyKey?: string,
  ): Promise<GuestSession> {
    if (idempotencyKey) {
      const hit = await this.redis.get(`idem:start:${idempotencyKey}`);
      if (hit) {
        const { roomId, userId } = JSON.parse(hit) as { roomId: string; userId: string };
        const [room, user] = await Promise.all([
          this.rooms.findById(roomId).catch(() => null),
          this.users.findById(userId),
        ]);
        if (room && user) return { user, room, tokens: null };
      }
    }

    const existing = await this.findLiveSessionUser(existingAccessToken);
    if (existing) {
      await this.rooms.assertMayCreate(existing.id, existing.isGuest);
      const room = await this.rooms.create(existing.id, roomName ?? `Комната ${displayName}`, options);
      let user = existing;
      if (existing.isGuest) {
        // Same person, new room: keep their guest account (and name — they just typed it), point
        // "my latest room" at the new one.
        [user] = await this.db
          .update(users)
          .set({ guestRoomId: room.id, displayName })
          .where(eq(users.id, existing.id))
          .returning();
      }
      await this.rememberStart(idempotencyKey, room.id, user.id);
      return { user, room, tokens: null };
    }

    await this.assertStartAllowed();

    const { user, room } = await this.db.transaction(async (tx) => {
      const [created] = await tx
        .insert(users)
        .values({ email: null, passwordHash: null, displayName, isGuest: true })
        .returning();
      const passwordHash = options.password
        ? await Bun.password.hash(options.password, { algorithm: "argon2id" })
        : null;
      const [createdRoom] = await tx
        .insert(rooms)
        .values({
          name: roomName ?? `Комната ${displayName}`,
          ownerId: created.id,
          visibility: options.visibility ?? "private",
          queueAddPolicy: options.visibility === "public" ? "owner" : "everyone",
          passwordHash,
        })
        .returning();
      await tx.insert(roomMembers).values({ roomId: createdRoom.id, userId: created.id, role: "owner" });
      const [scoped] = await tx
        .update(users)
        .set({ guestRoomId: createdRoom.id })
        .where(eq(users.id, created.id))
        .returning();
      return { user: scoped, room: createdRoom };
    });

    this.logger.log(`guest ${user.id} (${displayName}) started room ${room.id}`);
    await this.rememberStart(idempotencyKey, room.id, user.id);
    return { user, room, tokens: await this.auth.issueTokenPair(user) };
  }

  private async rememberStart(key: string | undefined, roomId: string, userId: string): Promise<void> {
    if (key) await this.redis.set(`idem:start:${key}`, JSON.stringify({ roomId, userId }), "EX", 60);
  }

  private async findLiveSessionUser(accessToken?: string): Promise<User | undefined> {
    if (!accessToken) return undefined;
    try {
      const { sub } = await this.jwt.verifyAsync<{ sub: string }>(accessToken, {
        secret: this.config.get("JWT_ACCESS_SECRET", { infer: true }),
      });
      return (await this.users.findById(sub)) ?? undefined;
    } catch {
      return undefined;
    }
  }

  // Global ceiling, not per-IP: behind Caddy/Cloudflare every caller shares one source address, so
  // an IP throttler can't tell them apart (same reason the per-room counter exists).
  private async assertStartAllowed(): Promise<void> {
    const key = "guest:start:global";
    const count = await this.redis.incr(key);
    if (count === 1) await this.redis.expire(key, 60);
    if (count > GUEST_START_PER_MINUTE) {
      throw new HttpException(
        "Сейчас слишком много новых комнат — попробуйте через минуту",
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  // Someone reloading the page or re-submitting the form shouldn't mint a second guest row — and
  // a *logged-in* visitor opening a room link must keep their real account, since both share the
  // same cookie names. Returning the existing user covers both.
  private async reuseExistingSession(
    roomId: string,
    displayName: string,
    accessToken?: string,
    password?: string,
  ): Promise<User | undefined> {
    if (!accessToken) return undefined;

    let sub: string;
    try {
      const payload = await this.jwt.verifyAsync<{ sub: string }>(accessToken, {
        secret: this.config.get("JWT_ACCESS_SECRET", { infer: true }),
      });
      sub = payload.sub;
    } catch {
      return undefined; // expired or bogus — fall through and mint a fresh guest
    }

    const existing = await this.users.findById(sub);
    if (!existing) return undefined;

    if (!existing.isGuest) {
      // A real account: join them normally instead of downgrading them to a guest.
      await this.rooms.join(roomId, existing.id, password);
      return existing;
    }

    // A guest of another room is the same person opening a second link: join them here, keep one account.
    await this.rooms.join(roomId, existing.id, password);

    if (existing.displayName !== displayName) {
      const [updated] = await this.db.update(users).set({ displayName }).where(eq(users.id, existing.id)).returning();
      return updated;
    }
    return existing;
  }

  private async assertBurstAllowed(roomId: string): Promise<void> {
    const key = `guest:create:${roomId}`;
    const count = await this.redis.incr(key);
    if (count === 1) await this.redis.expire(key, 60);
    if (count > GUEST_BURST_PER_MINUTE) {
      throw new HttpException(
        "Слишком много входов в эту комнату — попробуйте через минуту",
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private async assertRoomHasSpace(roomId: string): Promise<void> {
    const guests = await this.db
      .select({ userId: roomMembers.userId })
      .from(roomMembers)
      .innerJoin(users, eq(users.id, roomMembers.userId))
      .where(and(eq(roomMembers.roomId, roomId), eq(users.isGuest, true)));

    if (guests.length >= this.config.get("MAX_GUESTS_PER_ROOM", { infer: true })) {
      throw new ForbiddenException("В комнате уже слишком много гостей");
    }
  }

  // Two people called "Макс" in one room would be indistinguishable in chat and the member list, but
  // that is no reason to refuse the second one: they become "Макс (2)".
  private async uniqueName(roomId: string, displayName: string): Promise<string> {
    const taken = new Set((await this.rooms.listMembers(roomId)).map((m) => m.displayName.toLowerCase()));
    if (!taken.has(displayName.toLowerCase())) return displayName;
    for (let i = 2; i < 100; i++) {
      const candidate = `${displayName} (${i})`;
      if (!taken.has(candidate.toLowerCase())) return candidate;
    }
    return `${displayName} (${Date.now() % 1000})`;
  }
}
