import type { FastifyReply } from "fastify";
import type { TokenPair } from "./auth.service";

const ACCESS_TOKEN_MAX_AGE_SEC = 15 * 60;
const REFRESH_TOKEN_MAX_AGE_SEC = 30 * 24 * 60 * 60;
// Must stay in sync with AuthController's route prefix + Nest's global "api" prefix.
const REFRESH_TOKEN_PATH = "/api/auth";

export function setAuthCookies(reply: FastifyReply, tokens: TokenPair, isProduction: boolean): void {
  reply.setCookie("access_token", tokens.accessToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/",
    maxAge: ACCESS_TOKEN_MAX_AGE_SEC,
  });

  // Scoped so it isn't sent on every request — only refresh/logout need it. The path must match
  // where those endpoints *actually* live: Nest mounts every controller under /api
  // (setGlobalPrefix in main.ts), so they are /api/auth/refresh and /api/auth/logout. A cookie
  // scoped to "/auth" never gets sent to "/api/auth/..." at all (RFC 6265 path matching is a
  // prefix test, not a substring one) — which silently breaks refresh entirely *and* leaves
  // logout unable to revoke the token server-side, since the handler never sees it.
  reply.setCookie("refresh_token", tokens.refreshToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: REFRESH_TOKEN_PATH,
    maxAge: REFRESH_TOKEN_MAX_AGE_SEC,
  });

  // Intentionally readable by JS and intentionally worthless on its own: it holds no token, only
  // the fact that a session exists. Both real cookies are httpOnly, so without this the frontend
  // cannot distinguish "logged out" from "never logged in" and has to probe /auth/me on every
  // cold load — which is a guaranteed 401 for every first-time visitor. Lifetime matches the
  // refresh token, since that's what actually determines whether a session can be revived.
  reply.setCookie("has_session", "1", {
    httpOnly: false,
    secure: isProduction,
    sameSite: "lax",
    path: "/",
    maxAge: REFRESH_TOKEN_MAX_AGE_SEC,
  });
}

export function clearAuthCookies(reply: FastifyReply): void {
  reply.clearCookie("access_token", { path: "/" });
  reply.clearCookie("refresh_token", { path: REFRESH_TOKEN_PATH });
  reply.clearCookie("has_session", { path: "/" });
}
