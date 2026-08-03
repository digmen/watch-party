import { describe, expect, test } from "bun:test";
import { PlaybackStateService } from "./playback-state.service";

// `projectedPosition` doesn't touch Redis at all — a real client isn't needed to exercise it.
const service = new PlaybackStateService(null as never);

describe("PlaybackStateService.projectedPosition", () => {
  test("returns the stored position unchanged while paused", () => {
    const state = { status: "paused" as const, positionSec: 42, updatedAtMs: 1000 };
    expect(service.projectedPosition(state, 5000)).toBe(42);
  });

  test("advances the position by elapsed time while playing", () => {
    const state = { status: "playing" as const, positionSec: 10, updatedAtMs: 1000 };
    // 4000ms elapsed since updatedAtMs -> +4s
    expect(service.projectedPosition(state, 5000)).toBe(14);
  });

  test("returns exactly the stored position at zero elapsed time", () => {
    const state = { status: "playing" as const, positionSec: 7, updatedAtMs: 2000 };
    expect(service.projectedPosition(state, 2000)).toBe(7);
  });
});
