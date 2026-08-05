import {
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { and, eq } from "drizzle-orm";
import type Redis from "ioredis";
import type { Env } from "../../config/env.schema";
import { DRIZZLE_CLIENT, type DrizzleDb } from "../../database/drizzle.module";
import { type Room, roomMembers, type User, users } from "../../database/schema";
import { REDIS_CLIENT } from "../../redis/redis.module";
import { AuthService, type TokenPair } from "../auth/auth.service";
import { RoomsService } from "../rooms/rooms.service";
import { UsersService } from "../users/users.service";

// Per-room burst ceiling, independent of the HTTP throttler: behind cloudflared -> Traefik every
// request shares one source IP, so the IP-based limiter can't distinguish callers at all.
const GUEST_BURST_PER_MINUTE = 10;

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

  async createSession(roomId: string, displayName: string, existingAccessToken?: string): Promise<GuestSession> {
    // Throws NotFoundException if the room doesn't exist. The UUID *is* the invite credential, so
    // "does this room exist" is inherently observable — but guessing a v4 UUID isn't feasible.
    const room = await this.rooms.findById(roomId);
    if (!room.isActive) throw new ForbiddenException("Комната больше не активна");

    const reused = await this.reuseExistingSession(roomId, displayName, existingAccessToken);
    if (reused) return { user: reused, room, tokens: null };

    await this.assertBurstAllowed(roomId);
    await this.assertRoomHasSpace(roomId);
    await this.assertNameAvailable(roomId, displayName);

    // One transaction: a failed membership insert must not leave an orphan user row behind.
    const user = await this.db.transaction(async (tx) => {
      const [created] = await tx
        .insert(users)
        .values({ email: null, passwordHash: null, displayName, isGuest: true, guestRoomId: roomId })
        .returning();
      await tx.insert(roomMembers).values({ roomId, userId: created.id, role: "member" }).onConflictDoNothing();
      return created;
    });

    this.logger.log(`guest ${user.id} (${displayName}) joined room ${roomId}`);
    return { user, room, tokens: await this.auth.issueTokenPair(user) };
  }

  // Someone reloading the page or re-submitting the form shouldn't mint a second guest row — and
  // a *logged-in* visitor opening a room link must keep their real account, since both share the
  // same cookie names. Returning the existing user covers both.
  private async reuseExistingSession(
    roomId: string,
    displayName: string,
    accessToken?: string,
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
      await this.rooms.join(roomId, existing.id);
      return existing;
    }

    if (existing.guestRoomId !== roomId) return undefined; // guest of a different room — new session

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

  // Without this a guest could take the host's exact name and be indistinguishable from them in
  // chat and the presence list.
  private async assertNameAvailable(roomId: string, displayName: string): Promise<void> {
    const members = await this.rooms.listMembers(roomId);
    const taken = members.some((m) => m.displayName.toLowerCase() === displayName.toLowerCase());
    if (taken) throw new ConflictException("Это имя в комнате уже занято — выберите другое");
  }
}
