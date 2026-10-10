import type {
  PauseEvent,
  PlayEvent,
  PresenceUpdate,
  QueueItemDto,
  SeekEvent,
  VideoAssetDto,
} from "@watch-party/shared";
import { defineStore } from "pinia";
import { queueApi } from "../api/queue.api";
import { expectedPosition, isNewerVersion, type RoomPlaybackState } from "../ws/clock-sync";
import { roomSocket } from "../ws/room-socket";

interface PresenceMember {
  userId: string;
  displayName: string;
}

interface PlayerState {
  roomId: string | null;
  members: PresenceMember[];
  // Names of people whose picture is still loading — the whole room is held until they catch up.
  waitingFor: string[];
  // The room's video queue: the current video first, then what is lined up.
  queue: QueueItemDto[];
  playback: RoomPlaybackState;
}

export const usePlayerStore = defineStore("player", {
  state: (): PlayerState => ({
    roomId: null,
    members: [],
    waitingFor: [],
    queue: [],
    playback: { status: "paused", positionSec: 0, updatedAtMs: 0, version: 0 },
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
      roomSocket.onQueueUpdated((event) => {
        if (event.roomId === this.roomId) this.queue = event.items;
      });
      roomSocket.onRoomStall((event) => {
        if (event.roomId === this.roomId) this.waitingFor = event.waitingFor;
      });
      roomSocket.onPlay((event) => this.applyEvent(event as PlayEvent, "playing"));
      roomSocket.onPause((event) => this.applyEvent(event as PauseEvent, "paused"));
      roomSocket.onSeek((event) => this.applyEvent(event as SeekEvent, this.playback.status));
      roomSocket.onHeartbeat((event) => {
        // A heartbeat computed before a pause can still arrive after it; its version gives it away.
        if (!isNewerVersion(event.version, this.playback.version)) return;
        this.playback = {
          status: event.status,
          positionSec: event.positionSec,
          updatedAtMs: event.serverTimestampMs,
          version: event.version ?? this.playback.version,
        };
      });

      // After a network drop the room is re-joined automatically; adopt the state it reports and
      // forget who we were waiting for (that list is rebuilt by the next stall event).
      roomSocket.onReconnect((state) => {
        if (state) this.playback = state.playback;
        this.waitingFor = [];
        void this.loadQueue();
      });

      const result = await roomSocket.joinRoom(roomId);
      if ("playback" in result) this.playback = result.playback;
      await this.loadQueue();
    },

    async loadQueue() {
      if (!this.roomId) return;
      try {
        this.queue = (await queueApi.list(this.roomId)).items;
      } catch {
        // The next queue:updated event or reconnect refreshes it; the list is not worth an error.
      }
    },

    reportReady(assetId: string) {
      if (this.roomId) roomSocket.emitReady(this.roomId, assetId);
    },

    reportEnded(assetId: string) {
      if (this.roomId) roomSocket.emitEnded(this.roomId, assetId);
    },

    // Must be called after enterRoom: the socket doesn't exist until then, and roomSocket's
    // handlers are registered against `this.socket?`, so subscribing earlier silently no-ops.
    onVideoChanged(handler: (video: VideoAssetDto) => void) {
      roomSocket.onVideoChanged(handler);
    },

    applyEvent(
      event: { positionSec: number; originTimestampMs: number; version?: number },
      status: "playing" | "paused",
    ) {
      if (!isNewerVersion(event.version, this.playback.version)) return;
      this.playback = {
        status,
        positionSec: event.positionSec,
        updatedAtMs: event.originTimestampMs,
        version: event.version ?? this.playback.version,
      };
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

    // Everyone in the room follows this: the server rebroadcasts it, and the position is applied
    // locally right away so the slider doesn't snap back while the round trip is in flight.
    reportStall(stalled: boolean) {
      if (this.roomId) roomSocket.emitStall(this.roomId, stalled);
    },

    seek(userId: string, positionSec: number) {
      if (!this.roomId) return;
      const originTimestampMs = Date.now();
      roomSocket.emitSeek({ roomId: this.roomId, positionSec, originTimestampMs, byUserId: userId });
      this.applyEvent({ positionSec, originTimestampMs: roomSocket.clockSync.correctedNow() }, this.playback.status);
    },

    leaveRoom() {
      if (this.roomId) roomSocket.leaveRoom(this.roomId);
      roomSocket.disconnect();
      this.roomId = null;
      this.members = [];
      this.waitingFor = [];
      this.queue = [];
    },
  },
});
