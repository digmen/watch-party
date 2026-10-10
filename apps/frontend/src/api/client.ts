// Empty string (not a localhost fallback) is the correct default: in production this app is
// served from the same origin as the API (Traefik path-routes both from one hostname behind the
// Cloudflare Tunnel), so relative URLs are what's wanted. `.env` is dockerignored, so the Docker
// build never sees VITE_API_ORIGIN at all and must fall through to this default correctly. Local
// `bun run dev` sets VITE_API_ORIGIN=http://localhost:3000 explicitly (see apps/frontend/.env)
// since dev mode really does run frontend/backend on two different ports.
export const API_ORIGIN = import.meta.env.VITE_API_ORIGIN ?? "";
const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const REFRESH_PATH = "/auth/refresh";

// A deliberately non-httpOnly companion to the real auth cookies (set in cookie.util.ts). It
// carries no secret — it exists only so the client can tell "this browser has a session" from
// "this browser has never logged in", which is otherwise unknowable: both auth cookies are
// httpOnly and nothing is persisted in storage.
//
// Without it the app has to guess, and it guessed wrong in the most visible way possible: every
// first-time visitor got a 401 on /auth/me plus a second 401 from the refresh retry, in the
// console, on the login page.
const SESSION_HINT_COOKIE = "has_session";

export function hasSessionHint(): boolean {
  return document.cookie.split("; ").some((c) => c.startsWith(`${SESSION_HINT_COOKIE}=`));
}

function clearSessionHint(): void {
  document.cookie = `${SESSION_HINT_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
}

let cachedCsrfToken: string | null = null;
let refreshInFlight: Promise<boolean> | null = null;

async function fetchCsrfToken(): Promise<string> {
  const res = await fetch(`${API_ORIGIN}/auth/csrf-token`, { credentials: "include" });
  const data = (await res.json()) as { token: string };
  cachedCsrfToken = data.token;
  return data.token;
}

// Deliberately a raw fetch rather than a call back into apiFetch: apiFetch retries on 401 by
// calling *this*, so routing it through there would recurse.
//
// Single-flight matters more than it looks: the backend rotates refresh tokens on use and revokes
// the presented one (rotateRefreshToken in auth.service.ts), so two concurrent refreshes would
// invalidate each other and genuinely log the user out. A room view polling video status while
// other views make their own calls hits exactly that — several requests 401 in the same tick.
export function refreshSession(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const csrfToken = cachedCsrfToken ?? (await fetchCsrfToken());
        const res = await fetch(`${API_ORIGIN}/api${REFRESH_PATH}`, {
          method: "POST",
          headers: { "x-csrf-token": csrfToken },
          credentials: "include",
        });
        // A refused refresh means the session is genuinely unrecoverable (token revoked, rotated
        // away, or expired). Drop the hint so later page loads stop probing and quietly retrying
        // a session that no longer exists — the server only clears it on an explicit logout.
        if (!res.ok) clearSessionHint();
        return res.ok;
      } catch {
        return false;
      } finally {
        refreshInFlight = null;
      }
    })();
  }
  return refreshInFlight;
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
}

function buildHeaders(hasBody: boolean, csrfToken?: string): Record<string, string> {
  const headers: Record<string, string> = {};
  if (hasBody) headers["Content-Type"] = "application/json";
  if (csrfToken) headers["x-csrf-token"] = csrfToken;
  return headers;
}

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = options.method ?? "GET";
  const hasBody = options.body !== undefined;
  const isUnsafe = UNSAFE_METHODS.has(method);

  // /api namespaces every Nest-routed endpoint away from the frontend's own client-side routes
  // (see the setGlobalPrefix comment in apps/backend/src/main.ts for why that split exists) — the
  // two routes registered directly on the raw Fastify instance (csrf-token, Google's redirect)
  // intentionally live outside this prefix and don't go through apiFetch at all.
  const doFetch = (csrfToken?: string) =>
    fetch(`${API_ORIGIN}/api${path}`, {
      method,
      headers: { ...buildHeaders(hasBody, csrfToken), ...(options.headers ?? {}) },
      credentials: "include",
      body: hasBody ? JSON.stringify(options.body) : undefined,
    });

  let res = await doFetch(isUnsafe ? (cachedCsrfToken ?? (await fetchCsrfToken())) : undefined);

  // CSRF secret cookie can outlive our in-memory token cache (page reload); one retry after a
  // fresh token covers that case without forcing a token fetch on every single request.
  if (res.status === 403 && isUnsafe) {
    res = await doFetch(await fetchCsrfToken());
  }

  // The access token expires after 15 minutes while the refresh token is good for 30 days, so a
  // 401 usually means "session is fine, this one token went stale" — not "logged out". Without
  // this, simply leaving a tab open past that window breaks every subsequent request until a
  // manual re-login (which is how this was found: a long video remux was being polled).
  // Only worth attempting when a session plausibly exists — see hasSessionHint. Refreshing on a
  // browser that never logged in can only ever 401 again, which is pure noise.
  if (res.status === 401 && path !== REFRESH_PATH && hasSessionHint() && (await refreshSession())) {
    res = await doFetch(isUnsafe ? (cachedCsrfToken ?? (await fetchCsrfToken())) : undefined);
  }

  const data = await res.json().catch(() => undefined);
  if (!res.ok) {
    throw new ApiError(res.status, (data as { message?: string })?.message ?? res.statusText);
  }
  return data as T;
}
