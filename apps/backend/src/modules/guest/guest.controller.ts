import { Body, Controller, HttpCode, HttpStatus, Post, Req, Res } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Throttle } from "@nestjs/throttler";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { Env } from "../../config/env.schema";
import { setAuthCookies } from "../auth/cookie.util";
import { toRoomDto } from "../rooms/room.presenter";
import { RoomsService } from "../rooms/rooms.service";
import { toUserDto } from "../users/user.presenter";
import { GuestJoinDto, GuestStartDto } from "./dto/guest.dto";
import { GuestService } from "./guest.service";

// Shares the "auth" prefix with AuthController — legal in Nest since the full paths differ, and it
// keeps the URL where a client would expect it (/api/auth/guest). Kept as its own module because
// RoomsModule already imports AuthModule, so hosting this on AuthController would need forwardRef
// on both sides.
//
// Note this deliberately does NOT inherit AuthController's 10/min class throttle: several friends
// opening the same invite at once are normal traffic, not a brute-force attempt. The real ceiling
// is the per-room Redis counter in GuestService.
@Controller("auth")
@Throttle({ default: { limit: 20, ttl: 60_000 } })
export class GuestController {
  constructor(
    private readonly guests: GuestService,
    private readonly rooms: RoomsService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  @Post("guest")
  @HttpCode(HttpStatus.OK)
  async join(
    @Body() dto: GuestJoinDto,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const session = await this.guests.createSession(
      dto.roomId,
      dto.displayName,
      request.cookies?.access_token,
      dto.password,
    );

    // Null tokens mean an existing session was reused — its cookies are already valid, and
    // re-issuing would needlessly rotate a real account's refresh token.
    if (session.tokens) {
      const isProduction = this.config.get("NODE_ENV", { infer: true }) === "production";
      setAuthCookies(reply, session.tokens, isProduction);
    }

    // The room comes back with the user so the client can render immediately — it can't fetch the
    // room itself until membership exists, which is only true once this call returns.
    const members = await this.rooms.listMembers(session.room.id);
    return { user: toUserDto(session.user), room: toRoomDto(session.room, members) };
  }

  // Creates a room and a guest host in one go — the no-signup entry point from the landing page.
  @Post("guest/start")
  @HttpCode(HttpStatus.OK)
  async start(
    @Body() dto: GuestStartDto,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const rawKey = request.headers["idempotency-key"];
    const idempotencyKey = typeof rawKey === "string" && /^[\w-]{8,64}$/.test(rawKey) ? rawKey : undefined;
    const session = await this.guests.startRoom(
      dto.displayName,
      dto.roomName,
      request.cookies?.access_token,
      { visibility: dto.visibility, password: dto.password },
      idempotencyKey,
    );
    if (session.tokens) {
      const isProduction = this.config.get("NODE_ENV", { infer: true }) === "production";
      setAuthCookies(reply, session.tokens, isProduction);
    }
    const members = await this.rooms.listMembers(session.room.id);
    return { user: toUserDto(session.user), room: toRoomDto(session.room, members) };
  }
}
