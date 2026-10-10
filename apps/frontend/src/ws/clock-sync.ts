export interface RoomPlaybackState {
  status: "playing" | "paused";
  positionSec: number;
  updatedAtMs: number;
  // Server's monotonic counter. Absent only on old servers / optimistic local updates.
  version?: number;
}

/** An event older than the state we already hold must be dropped (a late "playing" must not undo a pause). */
export function isNewerVersion(incoming: number | undefined, current: number | undefined): boolean {
  if (incoming === undefined || current === undefined) return true;
  return incoming >= current;
}

const HARD_SEEK_THRESHOLD_SEC = 0.3;
const SOFT_NUDGE_THRESHOLD_SEC = 0.05;
const NUDGE_RATE_FAST = 1.03;
const NUDGE_RATE_SLOW = 0.97;

/** Cristian's-algorithm-style offset estimation from repeated client<->server round trips. */
export class ClockSync {
  private readonly samples: number[] = [];
  private readonly maxSamples: number;

  constructor(maxSamples = 5) {
    this.maxSamples = maxSamples;
  }

  recordSample(clientSentMs: number, serverTimeMs: number, clientReceivedMs: number): void {
    const rtt = clientReceivedMs - clientSentMs;
    const offset = serverTimeMs - (clientSentMs + rtt / 2);
    this.samples.push(offset);
    if (this.samples.length > this.maxSamples) this.samples.shift();
  }

  get offsetMs(): number {
    if (this.samples.length === 0) return 0;
    const sorted = [...this.samples].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
  }

  correctedNow(): number {
    return Date.now() + this.offsetMs;
  }
}

export function expectedPosition(state: RoomPlaybackState, correctedNowMs: number): number {
  if (state.status !== "playing") return state.positionSec;
  return state.positionSec + (correctedNowMs - state.updatedAtMs) / 1000;
}

export type DriftCorrection = { action: "none" } | { action: "seek" } | { action: "nudge"; rate: number };

/** Small drift (jitter) gets absorbed with a barely-perceptible playbackRate nudge instead of a
 * jarring seek; only a real desync (>300ms) hard-seeks. */
export function computeDriftCorrection(currentTimeSec: number, expectedSec: number): DriftCorrection {
  const diff = currentTimeSec - expectedSec;
  const abs = Math.abs(diff);
  if (abs > HARD_SEEK_THRESHOLD_SEC) return { action: "seek" };
  if (abs > SOFT_NUDGE_THRESHOLD_SEC) return { action: "nudge", rate: diff < 0 ? NUDGE_RATE_FAST : NUDGE_RATE_SLOW };
  return { action: "none" };
}
