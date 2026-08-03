import type { PauseEvent, PlayEvent, PresenceUpdate, SeekEvent } from "@watch-party/shared";
import { defineStore } from "pinia";
import { expectedPosition, type RoomPlaybackState } from "../ws/clock-sync";
import { roomSocket } from "../ws/room-socket";

interface PresenceMember {
  userId: string;
  displayName: string;
}

interface PlayerState {
  roomId: string | null;
  members: PresenceMember[];
  playback: RoomPlaybackState;
}

export const usePlayerStore = defineStore("player", {
  state: (): PlayerState => ({
    roomId: null,
    members: [],
    playback: { status: "paused", positionSec: 0, updatedAtMs: 0 },
  }),

  actions: {
    // Deliberately an action, not a getter: Pinia getters are cached Vue `computed`s that only
    // re-run when a *reactive* dependency changes, but the input here is `Date.now()` — nothing
    // reactive to key off. Callers that want a ticking display value re-invoke this on their own
    // interval/rAF loop instead of relying on Vue to notice time passing.
    getDisplayPositionSec(): number {
      return expectedPosition(this.playback, roomSocket.clockSync.correctedNow());
    },

    async enterRoom(roomId: string) {
      this.roomId = roomId;
      roomSocket.connect();

      roomSocket.onPresence((event: PresenceUpdate) => {
        if (event.roomId === this.roomId) this.members = event.members;
      });
      roomSocket.onPlay((event) => this.applyEvent(event as PlayEvent, "playing"));
      roomSocket.onPause((event) => this.applyEvent(event as PauseEvent, "paused"));
      roomSocket.onSeek((event) => this.applyEvent(event as SeekEvent, this.playback.status));
      roomSocket.onHeartbeat((event) => {
        this.playback = { status: event.status, positionSec: event.positionSec, updatedAtMs: event.serverTimestampMs };
      });

      const result = await roomSocket.joinRoom(roomId);
      if ("playback" in result) this.playback = result.playback;
    },

    applyEvent(event: { positionSec: number; originTimestampMs: number }, status: "playing" | "paused") {
      this.playback = { status, positionSec: event.positionSec, updatedAtMs: event.originTimestampMs };
    },

    play(userId: string) {
      if (!this.roomId) return;
      roomSocket.emitPlay({
        roomId: this.roomId,
        positionSec: this.playback.positionSec,
        originTimestampMs: Date.now(),
        byUserId: userId,
      });
    },

    pause(userId: string) {
      if (!this.roomId) return;
      roomSocket.emitPause({
        roomId: this.roomId,
        positionSec: this.getDisplayPositionSec(),
        originTimestampMs: Date.now(),
        byUserId: userId,
      });
    },

    leaveRoom() {
      if (this.roomId) roomSocket.leaveRoom(this.roomId);
      roomSocket.disconnect();
      this.roomId = null;
      this.members = [];
    },
  },
});
