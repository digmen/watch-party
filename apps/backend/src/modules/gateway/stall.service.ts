import { Inject, Injectable } from "@nestjs/common";
import type Redis from "ioredis";
import { REDIS_CLIENT } from "../../redis/redis.module";

// A viewer who reported a stall and then vanished (closed the tab, lost the network) must not hold
// the room hostage — their entry expires on its own.
const STALL_ENTRY_MAX_AGE_MS = 25_000;

export interface Staller {
  name: string;
  at: number;
}

// "Nobody watches a film without picture": while any member's buffer is empty the room is held
// paused, and it resumes by itself once every member has frames again. State lives in Redis so it
// is correct across backend replicas, like the playback state it drives.
@Injectable()
export class StallService {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  private stallKey(roomId: string): string {
    return `room:${roomId}:stall`;
  }

  private autoPausedKey(roomId: string): string {
    return `room:${roomId}:autopaused`;
  }

  async add(roomId: string, userId: string, name: string): Promise<void> {
    await this.redis.hset(this.stallKey(roomId), userId, JSON.stringify({ name, at: Date.now() } satisfies Staller));
    await this.redis.expire(this.stallKey(roomId), 120);
  }

  async remove(roomId: string, userId: string): Promise<void> {
    await this.redis.hdel(this.stallKey(roomId), userId);
  }

  // Current stallers, with dead ones swept out.
  async active(roomId: string): Promise<Array<Staller & { userId: string }>> {
    const raw = await this.redis.hgetall(this.stallKey(roomId));
    const now = Date.now();
    const alive: Array<Staller & { userId: string }> = [];
    for (const [userId, value] of Object.entries(raw)) {
      const entry = JSON.parse(value) as Staller;
      if (now - entry.at > STALL_ENTRY_MAX_AGE_MS) await this.redis.hdel(this.stallKey(roomId), userId);
      else alive.push({ ...entry, userId });
    }
    return alive;
  }

  async markAutoPaused(roomId: string): Promise<void> {
    await this.redis.set(this.autoPausedKey(roomId), "1", "EX", 3600);
  }

  // True exactly once per auto-pause, so only one caller resumes the room.
  async consumeAutoPaused(roomId: string): Promise<boolean> {
    return (await this.redis.del(this.autoPausedKey(roomId))) === 1;
  }

  async isAutoPaused(roomId: string): Promise<boolean> {
    return (await this.redis.exists(this.autoPausedKey(roomId))) === 1;
  }

  async clearAutoPaused(roomId: string): Promise<void> {
    await this.redis.del(this.autoPausedKey(roomId));
  }
}
