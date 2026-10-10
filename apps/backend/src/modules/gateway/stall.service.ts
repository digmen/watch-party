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

  // Remembers WHICH playback version the system paused. The room is resumed later only if nobody has
  // touched it since (a person pressing pause/play/seek makes the version move on).
  async markAutoPaused(roomId: string, version: number): Promise<void> {
    await this.redis.set(this.autoPausedKey(roomId), String(version), "EX", 3600);
  }

  // Returns the version that was auto-paused, or null. Deleting makes it single-use, so only one
  // caller resumes the room.
  async consumeAutoPaused(roomId: string): Promise<number | null> {
    const value = await this.redis.getdel(this.autoPausedKey(roomId));
    return value === null ? null : Number(value);
  }

  // A new video starts clean: nobody is being waited for, no pending auto-resume or auto-start.
  async clearAll(roomId: string): Promise<void> {
    await this.redis.del(this.stallKey(roomId), this.autoPausedKey(roomId), this.autoplayKey(roomId));
  }

  private autoplayKey(roomId: string): string {
    return `room:${roomId}:autoplay`;
  }

  private readyKey(roomId: string, assetId: string): string {
    return `room:${roomId}:ready:${assetId}`;
  }

  // "Start by yourself once everyone has the first seconds" — armed when one video follows another.
  async armAutoplay(roomId: string, plan: { assetId: string; deadlineMs: number; version: number }): Promise<void> {
    await this.redis.set(this.autoplayKey(roomId), JSON.stringify(plan), "EX", 120);
  }

  async getAutoplay(roomId: string): Promise<{ assetId: string; deadlineMs: number; version: number } | null> {
    const raw = await this.redis.get(this.autoplayKey(roomId));
    return raw ? JSON.parse(raw) : null;
  }

  // Single-use: whoever deletes the key is the one that starts the room.
  async takeAutoplay(roomId: string): Promise<boolean> {
    return (await this.redis.del(this.autoplayKey(roomId))) === 1;
  }

  async clearAutoplay(roomId: string): Promise<void> {
    await this.redis.del(this.autoplayKey(roomId));
  }

  async markReady(roomId: string, assetId: string, userId: string): Promise<void> {
    await this.redis.sadd(this.readyKey(roomId, assetId), userId);
    await this.redis.expire(this.readyKey(roomId, assetId), 600);
  }

  async readyUsers(roomId: string, assetId: string): Promise<Set<string>> {
    return new Set(await this.redis.smembers(this.readyKey(roomId, assetId)));
  }

  // True for exactly one caller per key within the TTL.
  async claimOnce(key: string, ttlSec: number): Promise<boolean> {
    return (await this.redis.set(`once:${key}`, "1", "EX", ttlSec, "NX")) === "OK";
  }

  async isAutoPaused(roomId: string): Promise<boolean> {
    return (await this.redis.exists(this.autoPausedKey(roomId))) === 1;
  }

  async clearAutoPaused(roomId: string): Promise<void> {
    await this.redis.del(this.autoPausedKey(roomId));
  }
}
