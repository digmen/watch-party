import { Inject, Injectable } from "@nestjs/common";
import Redis from "ioredis";
import { REDIS_CLIENT } from "../../redis/redis.module";

export interface PlaybackState {
  status: "playing" | "paused";
  positionSec: number;
  updatedAtMs: number;
  // Bumped by every change. Clients drop events older than what they hold; the heartbeat carries
  // it too, so a heartbeat computed just before a pause cannot resurrect playback.
  version: number;
}

const DEFAULT_STATE: PlaybackState = { status: "paused", positionSec: 0, updatedAtMs: 0, version: 0 };

// Store only if newer: two near-simultaneous writers must not leave the older one on top.
const SET_IF_NEWER = `
local cur = redis.call('GET', KEYS[1])
if cur then
  local v = cjson.decode(cur).version
  if v and tonumber(v) >= tonumber(ARGV[2]) then return 0 end
end
redis.call('SET', KEYS[1], ARGV[1], 'EX', 43200)
return 1`;

// The authoritative source for "where is playback right now" — every play/pause/seek writes
// here first, then gets broadcast. Living in Redis (not gateway memory) is what makes the
// heartbeat correct across multiple backend replicas: whichever instance's cron-ish interval
// fires next reads the same state everyone else wrote.
@Injectable()
export class PlaybackStateService {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  private key(roomId: string): string {
    return `room:${roomId}:playback`;
  }

  async get(roomId: string): Promise<PlaybackState> {
    const raw = await this.redis.get(this.key(roomId));
    if (!raw) return DEFAULT_STATE;
    const parsed = JSON.parse(raw) as PlaybackState;
    return { ...parsed, version: parsed.version ?? 0 };
  }

  // Returns the stored state including its new version — callers broadcast THAT version.
  async set(roomId: string, state: Omit<PlaybackState, "version">): Promise<PlaybackState> {
    const versionKey = `${this.key(roomId)}:version`;
    const version = await this.redis.incr(versionKey);
    await this.redis.expire(versionKey, 60 * 60 * 12);
    const full: PlaybackState = { ...state, version };
    await this.redis.eval(SET_IF_NEWER, 1, this.key(roomId), JSON.stringify(full), String(version));
    return full;
  }

  // Derives "where would playback be right now" for a currently-playing room, so a client that
  // just connected (or a heartbeat tick) gets a live position rather than a stale snapshot.
  projectedPosition(state: PlaybackState, nowMs: number): number {
    if (state.status !== "playing") return state.positionSec;
    return state.positionSec + (nowMs - state.updatedAtMs) / 1000;
  }

  // Distributed "who ticks this room this cycle" lock: every backend replica with a local
  // socket in the room runs the same heartbeat interval, but only the instance that wins this
  // NX lock actually broadcasts — otherwise a room split across N replicas would get N heartbeats
  // per tick instead of one. TTL shorter than the tick interval so a crashed instance can't wedge
  // the room's heartbeat forever.
  async tryAcquireHeartbeatLock(roomId: string, instanceId: string, ttlSec: number): Promise<boolean> {
    const result = await this.redis.set(`room:${roomId}:heartbeat-lock`, instanceId, "EX", ttlSec, "NX");
    return result === "OK";
  }
}
