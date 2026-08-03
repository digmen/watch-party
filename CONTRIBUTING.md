# Contributing

## Setup

```bash
cp .env.example .env
cp apps/frontend/.env.example apps/frontend/.env
bun install
bun run dev   # starts postgres + redis in Docker
```

Then run the backend and frontend directly on the host (not in Docker) for fast iteration:

```bash
cd apps/backend && bun run start:dev
cd apps/frontend && bun run dev
```

## Before opening a PR

```bash
bun run build       # builds packages/shared first, then backend + frontend
bun run lint
bun run typecheck
bun run test
```

All four run in CI (`.github/workflows/ci.yml`), along with a check that both Dockerfiles still
build.

## Conventions

- **Formatting/linting**: [Biome](https://biomejs.dev) (`biome.json` at the repo root) covers
  `.ts`/`.js`. It doesn't parse `.vue` files — format those with your editor's Vue support, or
  don't worry about it too much; nothing in CI checks `.vue` formatting today.
  **`style/useImportType` is deliberately disabled.** NestJS's DI resolves constructor parameters
  (and things like `@WebSocketServer()`) via `emitDecoratorMetadata`, which needs an actual runtime
  class reference — `import type` erases that reference entirely. Auto-converting a service import
  to `import type` produces no compiler error anywhere; it just makes that dependency silently
  unresolvable at boot ("Nest can't resolve dependencies..."). Don't manually add `import type` for
  a class that's ever used as a constructor parameter, `@Inject()` target, or gateway
  property-decorator type in the backend.
- **Database changes**: edit the Drizzle schema under `apps/backend/src/database/schema/`, then
  run `bun run db:generate` (from `apps/backend`) to produce a migration. Commit the generated SQL
  file — migrations are applied via `bun run db:migrate`.
- **Shared types**: if a change touches the wire contract between frontend and backend (an API
  response shape, a WebSocket event payload), add/update the zod schema in `packages/shared` first
  — both sides should consume that schema, not hand-rolled duplicate interfaces.
- **Commits**: no enforced format, just write what changed and why.

## Reporting bugs / proposing features

Open an issue. For anything security-sensitive, see [SECURITY.md](SECURITY.md) instead of a public
issue.
