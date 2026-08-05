import { type CanActivate, type ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import type { FastifyRequest } from "fastify";
import type { Env } from "../../config/env.schema";

export interface AuthenticatedUser {
  sub: string;
  email: string | null;
  isGuest: boolean;
  guestRoomId: string | null;
}

// Hand-rolled instead of a passport-jwt strategy: @nestjs/passport doesn't reliably work under
// @nestjs/platform-fastify (passport assumes an Express-shaped req/res), so there is no passport
// dependency anywhere in this app's auth path.
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<FastifyRequest & { user?: AuthenticatedUser }>();
    const token = request.cookies?.access_token;
    if (!token) throw new UnauthorizedException("Missing access token");

    try {
      const payload = await this.jwt.verifyAsync<Partial<AuthenticatedUser> & { sub: string }>(token, {
        secret: this.config.get("JWT_ACCESS_SECRET", { infer: true }),
      });
      // Normalized rather than assigned straight through: tokens minted before guests existed
      // carry no isGuest claim, and they all belong to real accounts. Defaulting to false is both
      // correct for them and fail-safe (an absent claim never grants guest-only leniency).
      request.user = {
        sub: payload.sub,
        email: payload.email ?? null,
        isGuest: payload.isGuest === true,
        guestRoomId: payload.guestRoomId ?? null,
      };
      return true;
    } catch {
      throw new UnauthorizedException("Invalid or expired access token");
    }
  }
}
