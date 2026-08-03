import { Body, Controller, Get, HttpCode, Post, Req, Res, UnauthorizedException, UseGuards } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Throttle } from "@nestjs/throttler";
import type { FastifyReply, FastifyRequest } from "fastify";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { type AuthenticatedUser, JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import type { Env } from "../../config/env.schema";
import { toUserDto } from "../users/user.presenter";
import { UsersService } from "../users/users.service";
import { AuthService } from "./auth.service";
import { clearAuthCookies, setAuthCookies } from "./cookie.util";
import { LoginDto, RegisterDto } from "./dto/auth.dto";

interface GoogleUserInfo {
  sub: string;
  email: string;
  name?: string;
}

@Controller("auth")
@Throttle({ default: { limit: 10, ttl: 60_000 } }) // brute-force guard, tighter than the global 120/min
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly users: UsersService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  private get isProduction(): boolean {
    return this.config.get("NODE_ENV", { infer: true }) === "production";
  }

  // Note: GET /auth/csrf-token is registered directly on the raw Fastify instance in main.ts,
  // not here — see the comment there for why (Nest's @Res() reply isn't the same prototype
  // instance @fastify/csrf-protection decorates).

  @Post("register")
  async register(@Body() dto: RegisterDto, @Res({ passthrough: true }) reply: FastifyReply) {
    const displayName = dto.email.split("@")[0];
    const { user, tokens } = await this.auth.register(dto.email, dto.password, displayName);
    setAuthCookies(reply, tokens, this.isProduction);
    return { user: toUserDto(user) };
  }

  @Post("login")
  @HttpCode(200)
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) reply: FastifyReply) {
    const user = await this.auth.validateCredentials(dto.email, dto.password);
    const tokens = await this.auth.issueTokenPair(user);
    setAuthCookies(reply, tokens, this.isProduction);
    return { user: toUserDto(user) };
  }

  @Post("refresh")
  @HttpCode(200)
  async refresh(@Req() request: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply) {
    const rawRefreshToken = request.cookies?.refresh_token;
    if (!rawRefreshToken) throw new UnauthorizedException("Missing refresh token");

    const tokens = await this.auth.rotateRefreshToken(rawRefreshToken);
    setAuthCookies(reply, tokens, this.isProduction);
    return { ok: true };
  }

  @Post("logout")
  @HttpCode(200)
  async logout(@Req() request: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply) {
    const rawRefreshToken = request.cookies?.refresh_token;
    if (rawRefreshToken) await this.auth.revokeRefreshToken(rawRefreshToken);
    clearAuthCookies(reply);
    return { ok: true };
  }

  @Get("me")
  @UseGuards(JwtAuthGuard)
  async me(@CurrentUser() currentUser: AuthenticatedUser) {
    const user = await this.users.findById(currentUser.sub);
    if (!user) throw new UnauthorizedException("User no longer exists");
    return { user: toUserDto(user) };
  }

  // Note: GET /auth/google itself is registered by the @fastify/oauth2 plugin directly on the
  // Fastify instance in main.ts (its startRedirectPath), not here — Nest never sees that route.
  @Get("google/callback")
  async googleCallback(@Req() request: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply) {
    const fastify = request.server as FastifyRequest["server"] & {
      googleOAuth2: {
        getAccessTokenFromAuthorizationCodeFlow: (req: FastifyRequest) => Promise<{ token: { access_token: string } }>;
      };
    };

    const { token } = await fastify.googleOAuth2.getAccessTokenFromAuthorizationCodeFlow(request);

    const userInfoRes = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { Authorization: `Bearer ${token.access_token}` },
    });
    if (!userInfoRes.ok) throw new UnauthorizedException("Failed to fetch Google profile");
    const profile = (await userInfoRes.json()) as GoogleUserInfo;

    const user = await this.auth.upsertGoogleUser({
      googleId: profile.sub,
      email: profile.email,
      displayName: profile.name ?? profile.email.split("@")[0],
    });

    const tokens = await this.auth.issueTokenPair(user);
    setAuthCookies(reply, tokens, this.isProduction);

    const frontendOrigin = this.config.get("FRONTEND_ORIGIN", { infer: true });
    reply.redirect(frontendOrigin);
  }
}
