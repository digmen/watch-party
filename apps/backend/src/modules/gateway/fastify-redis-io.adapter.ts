import type { INestApplicationContext } from "@nestjs/common";
import { IoAdapter } from "@nestjs/platform-socket.io";

// Works around nestjs/nest#14953 / #9903: the default IoAdapter tries to spin up its own
// socket.io server on top of the Fastify HTTP server, which never becomes reachable under
// @nestjs/platform-fastify. `fastify-socket.io` (registered in main.ts) already created a real,
// working socket.io server bound to Fastify's underlying http.Server — this adapter's only job
// is to hand that existing instance back to Nest instead of letting it construct a new one, so
// `@WebSocketGateway()` classes keep using ordinary Nest DI/decorators on top of a topology that
// actually receives connections.
export class FastifySocketIoAdapter extends IoAdapter {
  constructor(private readonly app: INestApplicationContext) {
    super(app);
  }

  createIOServer(_port: number, _options?: unknown): unknown {
    const fastify = (this.app as any).getHttpAdapter().getInstance();
    return fastify.io;
  }
}
