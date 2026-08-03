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

let cachedCsrfToken: string | null = null;

async function fetchCsrfToken(): Promise<string> {
  const res = await fetch(`${API_ORIGIN}/auth/csrf-token`, { credentials: "include" });
  const data = (await res.json()) as { token: string };
  cachedCsrfToken = data.token;
  return data.token;
}

interface RequestOptions {
  method?: string;
  body?: unknown;
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
      headers: buildHeaders(hasBody, csrfToken),
      credentials: "include",
      body: hasBody ? JSON.stringify(options.body) : undefined,
    });

  let res = await doFetch(isUnsafe ? (cachedCsrfToken ?? (await fetchCsrfToken())) : undefined);

  // CSRF secret cookie can outlive our in-memory token cache (page reload); one retry after a
  // fresh token covers that case without forcing a token fetch on every single request.
  if (res.status === 403 && isUnsafe) {
    res = await doFetch(await fetchCsrfToken());
  }

  const data = await res.json().catch(() => undefined);
  if (!res.ok) {
    throw new ApiError(res.status, (data as { message?: string })?.message ?? res.statusText);
  }
  return data as T;
}
