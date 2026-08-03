# Build context is the monorepo root (see docker-compose.prod.yml) — every COPY below is
# relative to the repo root, not this file's directory.
#
# WORKDIR stays /repo (same as the source tree) all the way through, including runtime: Bun's
# workspace linking creates *relative* symlinks (e.g. apps/backend/node_modules/@watch-party/shared
# -> ../../../packages/shared) that only keep resolving correctly if the surrounding directory
# shape is preserved exactly, rather than flattened into some /app layout.

FROM oven/bun:1-alpine AS deps
WORKDIR /repo
COPY package.json bun.lock ./
COPY apps/backend/package.json apps/backend/package.json
COPY apps/frontend/package.json apps/frontend/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN bun install --frozen-lockfile

FROM oven/bun:1-alpine AS build
WORKDIR /repo
COPY --from=deps /repo/node_modules ./node_modules
COPY --from=deps /repo/apps/backend/node_modules ./apps/backend/node_modules
COPY --from=deps /repo/packages/shared/node_modules ./packages/shared/node_modules
COPY . .
RUN bun run --filter '@watch-party/shared' build \
 && bun run --filter '@watch-party/backend' build

FROM oven/bun:1-alpine AS prod-deps
WORKDIR /repo
COPY package.json bun.lock ./
COPY apps/backend/package.json apps/backend/package.json
COPY apps/frontend/package.json apps/frontend/package.json
COPY packages/shared/package.json packages/shared/package.json
# --frozen-lockfile checks the lockfile against *every* workspace it knows about, so all three
# package.json files must be present even though only backend+shared get copied into the runtime
# stage below — frontend's node_modules exists in this intermediate stage and nowhere else.
RUN bun install --frozen-lockfile --production

FROM oven/bun:1-alpine AS runtime
# ffmpeg is the one non-JS runtime dependency: the video-prefetch worker shells out to it for
# the mp4-remux path (see video-prefetch.processor.ts). Installed as root, before dropping to the
# unprivileged `bun` user below. Alpine's package (~130MB incl. deps) instead of Debian's apt build
# (~450MB) — this only remuxes (`-c copy`), so the extra encoder libraries Debian's package pulls
# in were pure waste anyway.
RUN apk add --no-cache ffmpeg

WORKDIR /repo
ENV NODE_ENV=production

COPY --from=prod-deps --chown=bun:bun /repo/node_modules ./node_modules
COPY --from=prod-deps --chown=bun:bun /repo/apps/backend/node_modules ./apps/backend/node_modules
COPY --from=prod-deps --chown=bun:bun /repo/packages/shared/node_modules ./packages/shared/node_modules

COPY --from=build --chown=bun:bun /repo/apps/backend/dist ./apps/backend/dist
COPY --from=build --chown=bun:bun /repo/packages/shared/dist ./packages/shared/dist
# packages/shared's package.json "exports" prefers a `bun`-condition entry pointing at ./src
# (fast dev iteration — see packages/shared/package.json) — since the runtime here is also Bun,
# that condition wins in prod too, so `src` has to exist here, not just `dist`.
COPY --chown=bun:bun packages/shared/src ./packages/shared/src
COPY --chown=bun:bun packages/shared/package.json ./packages/shared/package.json
COPY --chown=bun:bun apps/backend/package.json ./apps/backend/package.json
COPY --chown=bun:bun apps/backend/src/database/migrations ./apps/backend/dist/database/migrations

RUN mkdir -p /data/video-cache && chown bun:bun /data/video-cache

USER bun
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=3s --retries=3 \
  CMD ["bun", "-e", "fetch('http://localhost:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
CMD ["bun", "apps/backend/dist/main.js"]
