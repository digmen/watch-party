import { describe, expect, test } from "vitest";
import { ClockSync, computeDriftCorrection, expectedPosition } from "./clock-sync";

describe("expectedPosition", () => {
  test("stays put while paused regardless of elapsed time", () => {
    expect(expectedPosition({ status: "paused", positionSec: 10, updatedAtMs: 1000 }, 9000)).toBe(10);
  });

  test("advances by elapsed seconds while playing", () => {
    expect(expectedPosition({ status: "playing", positionSec: 10, updatedAtMs: 1000 }, 3000)).toBe(12);
  });
});

describe("computeDriftCorrection", () => {
  test("does nothing when within the soft threshold", () => {
    expect(computeDriftCorrection(10.02, 10)).toEqual({ action: "none" });
  });

  test("nudges playback rate up when behind by a moderate amount", () => {
    const result = computeDriftCorrection(9.8, 10); // 0.2s behind
    expect(result.action).toBe("nudge");
    if (result.action === "nudge") expect(result.rate).toBeGreaterThan(1);
  });

  test("nudges playback rate down when ahead by a moderate amount", () => {
    const result = computeDriftCorrection(10.2, 10); // 0.2s ahead
    expect(result.action).toBe("nudge");
    if (result.action === "nudge") expect(result.rate).toBeLessThan(1);
  });

  test("hard-seeks when drift exceeds 300ms", () => {
    expect(computeDriftCorrection(10.5, 10)).toEqual({ action: "seek" });
    expect(computeDriftCorrection(9.5, 10)).toEqual({ action: "seek" });
  });
});

describe("ClockSync", () => {
  test("offset is zero before any samples are recorded", () => {
    expect(new ClockSync().offsetMs).toBe(0);
  });

  test("estimates a positive offset when the server clock is ahead", () => {
    const sync = new ClockSync();
    // client sends at t=1000, server reports t=1100, client receives at t=1010 (10ms RTT)
    sync.recordSample(1000, 1100, 1010);
    // offset = serverTime - (clientSent + rtt/2) = 1100 - (1000 + 5) = 95
    expect(sync.offsetMs).toBe(95);
  });

  test("uses the median of the last samples, resisting a single outlier", () => {
    const sync = new ClockSync(5);
    sync.recordSample(0, 100, 10);
    sync.recordSample(0, 100, 10);
    sync.recordSample(0, 100, 10);
    sync.recordSample(0, 100, 10);
    sync.recordSample(0, 100000, 10); // one wild outlier
    // median of [~95, ~95, ~95, ~95, ~99995] is still ~95, not skewed by the outlier
    expect(sync.offsetMs).toBeLessThan(1000);
  });

  test("caps the sample window to maxSamples", () => {
    const sync = new ClockSync(2);
    sync.recordSample(0, 100, 10); // offset ~95, would be evicted
    sync.recordSample(0, 200, 10); // offset ~195
    sync.recordSample(0, 200, 10); // offset ~195
    expect(sync.offsetMs).toBeCloseTo(195, 0);
  });
});
