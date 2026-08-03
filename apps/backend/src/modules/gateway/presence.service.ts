import { Inject, Injectable } from "@nestjs/common";
import Redis from "ioredis";
import { REDIS_CLIENT } from "../../redis/redis.module";

interface PresenceEntry {
  userId: string;
  displayName: string;
}

// Keyed by socketId (not userId) so a user with multiple tabs/devices doesn't get removed from
// presence when only one of their sockets disconnects — presence is "does this user have at
// least one live socket in the room," not "is this specific socket alive."
@Injectable()
export class PresenceService {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  private key(roomId: string): string {
    return `room:${roomId}:sockets`;
  }

  async addSocket(roomId: string, socketId: string, entry: PresenceEntry): Promise<void> {
    await this.redis.hset(this.key(roomId), socketId, JSON.stringify(entry));
  }

  async removeSocket(roomId: string, socketId: string): Promise<void> {
    await this.redis.hdel(this.key(roomId), socketId);
  }

  async listMembers(roomId: string): Promise<PresenceEntry[]> {
    const raw = await this.redis.hvals(this.key(roomId));
    const seen = new Map<string, PresenceEntry>();
    for (const json of raw) {
      const entry = JSON.parse(json) as PresenceEntry;
      seen.set(entry.userId, entry); // dedupe multiple sockets from the same user
    }
    return [...seen.values()];
  }
}
