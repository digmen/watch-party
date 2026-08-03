import { describe, expect, test } from "bun:test";
import { LoginSchema, RegisterSchema } from "./auth.schema";
import { HeartbeatEventSchema, PlayEventSchema, PresenceUpdateSchema } from "./player-events.schema";
import { CreateRoomSchema } from "./room.schema";
import { AddVideoSchema } from "./video.schema";

describe("auth schemas", () => {
  test("accepts a valid registration payload", () => {
    const result = RegisterSchema.safeParse({ email: "a@example.com", password: "correcthorse123" });
    expect(result.success).toBe(true);
  });

  test("rejects a password shorter than 8 characters", () => {
    const result = RegisterSchema.safeParse({ email: "a@example.com", password: "short" });
    expect(result.success).toBe(false);
  });

  test("rejects an invalid email", () => {
    const result = LoginSchema.safeParse({ email: "not-an-email", password: "x" });
    expect(result.success).toBe(false);
  });
});

describe("room schemas", () => {
  test("rejects an empty room name", () => {
    expect(CreateRoomSchema.safeParse({ name: "" }).success).toBe(false);
  });

  test("rejects a room name over 80 characters", () => {
    expect(CreateRoomSchema.safeParse({ name: "x".repeat(81) }).success).toBe(false);
  });

  test("accepts a normal room name", () => {
    expect(CreateRoomSchema.safeParse({ name: "Movie night" }).success).toBe(true);
  });
});

describe("player-event schemas", () => {
  const validUserId = "550e8400-e29b-41d4-a716-446655440000";

  test("rejects a negative playback position", () => {
    const result = PlayEventSchema.safeParse({ positionSec: -1, originTimestampMs: Date.now(), byUserId: validUserId });
    expect(result.success).toBe(false);
  });

  test("accepts a valid play event", () => {
    const result = PlayEventSchema.safeParse({
      positionSec: 12.5,
      originTimestampMs: Date.now(),
      byUserId: validUserId,
    });
    expect(result.success).toBe(true);
  });

  test("heartbeat status must be playing or paused", () => {
    const result = HeartbeatEventSchema.safeParse({
      positionSec: 0,
      serverTimestampMs: Date.now(),
      status: "buffering",
    });
    expect(result.success).toBe(false);
  });

  test("presence update requires members to have userId + displayName", () => {
    const result = PresenceUpdateSchema.safeParse({ roomId: validUserId, members: [{ userId: validUserId }] });
    expect(result.success).toBe(false);
  });
});

describe("video schema", () => {
  test("rejects a non-URL source", () => {
    expect(AddVideoSchema.safeParse({ sourceUrl: "not a url" }).success).toBe(false);
  });

  test("accepts a direct video URL", () => {
    expect(AddVideoSchema.safeParse({ sourceUrl: "https://example.com/video.mp4" }).success).toBe(true);
  });
});
