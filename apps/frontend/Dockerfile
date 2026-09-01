# Build context is the monorepo root (see docker-compose.prod.yml).

FROM oven/bun:1-slim AS deps
WORKDIR /repo
COPY package.json bun.lock ./
COPY apps/backend/package.json apps/backend/package.json
COPY apps/frontend/package.json apps/frontend/package.json
COPY packages/shared/package.json packages/shared/package.json
# --frozen-lockfile checks the lockfile against *every* workspace it knows about, so all three
# package.json files must be present even though only frontend+shared node_modules get used below.
RUN bun install --frozen-lockfile

FROM oven/bun:1-slim AS build
WORKDIR /repo
# Vite bakes VITE_* env vars into the bundle at build time, not runtime — must arrive as a build
# arg here. Empty default keeps the image buildable without it (canonical/og:url/sitemap simply
# stay relative, see src/seo.ts), so this isn't a hard requirement for every environment.
ARG VITE_PUBLIC_ORIGIN=
ENV VITE_PUBLIC_ORIGIN=${VITE_PUBLIC_ORIGIN}
COPY --from=deps /repo/node_modules ./node_modules
COPY --from=deps /repo/apps/frontend/node_modules ./apps/frontend/node_modules
COPY --from=deps /repo/packages/shared/node_modules ./packages/shared/node_modules
COPY . .
RUN bun run --filter '@watch-party/shared' build \
 && bun run --filter '@watch-party/frontend' build

# gzip-precompress the build output at build time, not per-request at runtime — nginx then just
# serves the pre-made .gz sibling (gzip_static on) instead of spending prod CPU compressing on
# every response. (Brotli would compress further but needs ngx_brotli, absent from stock nginx —
# a possible follow-up, not worth compiling a custom nginx build for right now.)
RUN find apps/frontend/dist -type f \
      \( -name '*.js' -o -name '*.css' -o -name '*.html' -o -name '*.svg' -o -name '*.json' \
         -o -name '*.txt' -o -name '*.xml' -o -name '*.webmanifest' \) \
      -exec gzip --best --keep --force {} \;

FROM nginx:1.27-alpine AS runtime
COPY apps/frontend/nginx.conf /etc/nginx/nginx.conf
COPY --from=build /repo/apps/frontend/dist /usr/share/nginx/html

EXPOSE 80
# 127.0.0.1, not localhost: nginx's `listen 80;` binds IPv4 only, but Alpine/musl resolves
# "localhost" to ::1 (IPv6) first — wget would get "connection refused" on that address family
# and never fall back, so the healthcheck needs the literal IPv4 address.
HEALTHCHECK --interval=15s --timeout=3s --retries=3 \
  CMD ["wget", "-qO-", "http://127.0.0.1/"]
