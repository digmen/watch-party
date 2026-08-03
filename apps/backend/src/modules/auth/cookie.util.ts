import type { FastifyReply } from "fastify";
import type { TokenPair } from "./auth.service";

const ACCESS_TOKEN_MAX_AGE_SEC = 15 * 60;
const REFRESH_TOKEN_MAX_AGE_SEC = 30 * 24 * 60 * 60;

export function setAuthCookies(reply: FastifyReply, tokens: TokenPair, isProduction: boolean): void {
  reply.setCookie("access_token", tokens.accessToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/",
    maxAge: ACCESS_TOKEN_MAX_AGE_SEC,
  });

  // Scoped to /auth so it isn't sent on every request — only refresh/logout need it.
  reply.setCookie("refresh_token", tokens.refreshToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/auth",
    maxAge: REFRESH_TOKEN_MAX_AGE_SEC,
  });
}

export function clearAuthCookies(reply: FastifyReply): void {
  reply.clearCookie("access_token", { path: "/" });
  reply.clearCookie("refresh_token", { path: "/auth" });
}
