import { randomUUID } from "node:crypto";
import { ConflictException, Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { and, eq, isNull } from "drizzle-orm";
import type { Env } from "../../config/env.schema";
import { DRIZZLE_CLIENT, type DrizzleDb } from "../../database/drizzle.module";
import { oauthAccounts, refreshTokens, type User } from "../../database/schema";
import { UsersService } from "../users/users.service";
import { hashToken } from "./token.util";

const ACCESS_TOKEN_TTL = "15m";
const REFRESH_TOKEN_TTL_DAYS = 30;

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface GoogleProfile {
  googleId: string;
  email: string;
  displayName: string;
}

@Injectable()
export class AuthService {
  constructor(
    @Inject(DRIZZLE_CLIENT) private readonly db: DrizzleDb,
    private readonly users: UsersService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async register(email: string, password: string, displayName: string): Promise<{ user: User; tokens: TokenPair }> {
    const existing = await this.users.findByEmail(email);
    if (existing) throw new ConflictException("Email already registered");

    const passwordHash = await Bun.password.hash(password, { algorithm: "argon2id" });
    const user = await this.users.create({ email, passwordHash, displayName });
    const tokens = await this.issueTokenPair(user);
    return { user, tokens };
  }

  async validateCredentials(email: string, password: string): Promise<User> {
    const user = await this.users.findByEmail(email);
    if (!user?.passwordHash) throw new UnauthorizedException("Invalid email or password");

    const valid = await Bun.password.verify(password, user.passwordHash);
    if (!valid) throw new UnauthorizedException("Invalid email or password");
    return user;
  }

  async upsertGoogleUser(profile: GoogleProfile): Promise<User> {
    const [existingLink] = await this.db
      .select()
      .from(oauthAccounts)
      .where(and(eq(oauthAccounts.provider, "google"), eq(oauthAccounts.providerUserId, profile.googleId)))
      .limit(1);

    if (existingLink) {
      const user = await this.users.findById(existingLink.userId);
      if (!user) throw new UnauthorizedException("Linked account no longer exists");
      return user;
    }

    // No existing Google link — reuse an account with the same email (password + Google can
    // coexist on one user) or create a fresh Google-only user (no passwordHash).
    const user =
      (await this.users.findByEmail(profile.email)) ??
      (await this.users.create({
        email: profile.email,
        displayName: profile.displayName,
        passwordHash: null,
      }));

    await this.db.insert(oauthAccounts).values({
      provider: "google",
      providerUserId: profile.googleId,
      userId: user.id,
    });

    return user;
  }

  async issueTokenPair(user: User): Promise<TokenPair> {
    const accessToken = await this.jwt.signAsync(
      // Guest claims are read off the DB row here, deliberately — NOT stamped once at the guest
      // endpoint. `rotateRefreshToken` re-issues through this same method every 15 minutes, so
      // sourcing them anywhere else would silently promote a guest to a full account on their
      // first token refresh.
      { sub: user.id, email: user.email, isGuest: user.isGuest, guestRoomId: user.guestRoomId },
      { secret: this.config.get("JWT_ACCESS_SECRET", { infer: true }), expiresIn: ACCESS_TOKEN_TTL },
    );

    const jti = randomUUID();
    const refreshToken = await this.jwt.signAsync(
      { sub: user.id, jti },
      { secret: this.config.get("JWT_REFRESH_SECRET", { infer: true }), expiresIn: `${REFRESH_TOKEN_TTL_DAYS}d` },
    );

    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
    await this.db.insert(refreshTokens).values({
      userId: user.id,
      tokenHash: hashToken(refreshToken),
      expiresAt,
    });

    return { accessToken, refreshToken };
  }

  async rotateRefreshToken(rawRefreshToken: string): Promise<TokenPair> {
    let payload: { sub: string; jti: string };
    try {
      payload = await this.jwt.verifyAsync(rawRefreshToken, {
        secret: this.config.get("JWT_REFRESH_SECRET", { infer: true }),
      });
    } catch {
      throw new UnauthorizedException("Invalid or expired refresh token");
    }

    const tokenHash = hashToken(rawRefreshToken);
    const [stored] = await this.db
      .select()
      .from(refreshTokens)
      .where(and(eq(refreshTokens.tokenHash, tokenHash), isNull(refreshTokens.revokedAt)))
      .limit(1);

    if (!stored || stored.expiresAt < new Date()) {
      throw new UnauthorizedException("Refresh token has been revoked or expired");
    }

    const user = await this.users.findById(payload.sub);
    if (!user) throw new UnauthorizedException("User no longer exists");

    // Rotation-on-use: revoking the presented token before issuing a new pair means a replayed
    // (already-used) refresh token is rejected on its second use — a lightweight signal that the
    // token may have been stolen.
    await this.db.update(refreshTokens).set({ revokedAt: new Date() }).where(eq(refreshTokens.id, stored.id));

    return this.issueTokenPair(user);
  }

  async revokeRefreshToken(rawRefreshToken: string): Promise<void> {
    const tokenHash = hashToken(rawRefreshToken);
    await this.db.update(refreshTokens).set({ revokedAt: new Date() }).where(eq(refreshTokens.tokenHash, tokenHash));
  }
}
