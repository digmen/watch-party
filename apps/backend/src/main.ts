import "reflect-metadata";
import fastifyCookie from "@fastify/cookie";
import fastifyCors from "@fastify/cors";
import fastifyCsrfProtection from "@fastify/csrf-protection";
import fastifyHelmet from "@fastify/helmet";
import fastifyOauth2 from "@fastify/oauth2";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { createAdapter } from "@socket.io/redis-adapter";
import fastifySocketIo from "fastify-socket.io";
import Redis from "ioredis";
import { ZodValidationPipe } from "nestjs-zod";
import { AppModule } from "./app.module";
import type { Env } from "./config/env.schema";
import { FastifySocketIoAdapter } from "./modules/gateway/fastify-redis-io.adapter";

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter(), {
    bufferLogs: true,
  });

  const config = app.get(ConfigService<Env, true>);
  const isProduction = config.get("NODE_ENV", { infer: true }) === "production";
  const fastify = app.getHttpAdapter().getInstance();

  // Every Nest-routed endpoint lives under /api — deliberately separate from the frontend's own
  // client-side routes. Without this, the frontend's `/rooms/:id` view route and the backend's
  // `GET /rooms/:id` REST endpoint share the exact same path, and Traefik's PathPrefix-based
  // routing can't reliably tell "browser navigating to a page" apart from "SPA calling the API" —
  // this bit us for real: a fresh tab opening a room URL sometimes got the raw JSON back instead
  // of the page. The two routes registered directly on the raw Fastify instance below
  // (`/auth/csrf-token`, and `/auth/google` via the oauth2 plugin) intentionally stay outside this
  // prefix — they bypass Nest's router entirely, so setGlobalPrefix can't reach them anyway.
  app.setGlobalPrefix("api");

  await app.register(fastifyHelmet as any);
  await app.register(fastifyCors as any, {
    origin: config.get("FRONTEND_ORIGIN", { infer: true }),
    credentials: true,
  });
  await app.register(fastifyCookie as any, {
    secret: config.get("COOKIE_SECRET", { infer: true }),
  });
  await app.register(fastifyCsrfProtection as any, {
    // `cookieOpts` replaces the plugin's defaults wholesale (no shallow-merge with its
    // `{ path: '/', ... }` default) — omitting `path` here scopes the _csrf cookie to whatever
    // path issued it (/auth/csrf-token becomes /auth), so it silently never reaches routes
    // outside /auth. Must always be explicit here.
    cookieOpts: { signed: true, path: "/", sameSite: true, httpOnly: true },
  });

  // Double-submit CSRF check on every state-changing request. The frontend must call
  // GET /auth/csrf-token first (sets the signed secret cookie + hands back the token to echo
  // back as the `x-csrf-token` header on every POST/PUT/PATCH/DELETE, including login/register.
  //
  // Registered as a raw Fastify route (not a Nest controller method): @fastify/csrf-protection
  // decorates `reply.generateCsrf` on the real Fastify Reply prototype, and Nest's `@Res()` object
  // under platform-fastify doesn't carry that decoration — this route needs the genuine instance,
  // same reasoning as why the Google OAuth start-redirect route lives here too.
  fastify.get("/auth/csrf-token", async (_request, reply) => {
    return { token: (reply as any).generateCsrf() };
  });

  // `csrfProtection` is callback-style — (req, reply, next) — and calls `reply.send(err)` itself
  // on failure (short-circuiting without calling next), so the hook must use the callback form
  // too rather than being wrapped in a promise/await.
  const unsafeMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);
  fastify.addHook("onRequest", (request, reply, done) => {
    if (unsafeMethods.has(request.method)) {
      (fastify as any).csrfProtection(request, reply, done);
    } else {
      done();
    }
  });

  const googleClientId = config.get("GOOGLE_OAUTH_CLIENT_ID", { infer: true });
  const googleClientSecret = config.get("GOOGLE_OAUTH_CLIENT_SECRET", { infer: true });
  const googleCallbackUrl = config.get("GOOGLE_OAUTH_CALLBACK_URL", { infer: true });

  if (googleClientId && googleClientSecret && googleCallbackUrl) {
    await app.register(fastifyOauth2 as any, {
      name: "googleOAuth2",
      scope: ["openid", "profile", "email"],
      credentials: {
        client: { id: googleClientId, secret: googleClientSecret },
        auth: (fastifyOauth2 as any).GOOGLE_CONFIGURATION,
      },
      startRedirectPath: "/auth/google",
      callbackUri: googleCallbackUrl,
    });
  } else {
    fastify.log.warn("Google OAuth credentials not set — /auth/google is disabled in this environment");
  }

  // Realtime wiring (works around nestjs/nest#14953 — see fastify-redis-io.adapter.ts): mount
  // socket.io directly on the Fastify instance instead of letting Nest's default IoAdapter try
  // (and fail) to create its own, then hand Nest that already-working server via a custom adapter.
  await app.register(fastifySocketIo as any, {
    cors: { origin: config.get("FRONTEND_ORIGIN", { infer: true }), credentials: true },
  });

  const redisUrl = config.get("REDIS_URL", { infer: true });
  const pubClient = new Redis(redisUrl);
  const subClient = pubClient.duplicate();
  (fastify as any).io.adapter(createAdapter(pubClient, subClient));

  app.useWebSocketAdapter(new FastifySocketIoAdapter(app));

  app.useGlobalPipes(new ZodValidationPipe());
  app.enableShutdownHooks();

  const port = config.get("BACKEND_PORT", { infer: true });
  await app.listen(port, "0.0.0.0");
  fastify.log.info(`watch-party backend listening on :${port} (production=${isProduction})`);
}

bootstrap();
