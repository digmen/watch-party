import {
  type HeartbeatEvent,
  type PauseEvent,
  type PlayEvent,
  type PresenceUpdate,
  type SeekEvent,
  SocketEvents,
} from "@watch-party/shared";
import { io, type Socket } from "socket.io-client";
import { API_ORIGIN } from "../api/client";
import { ClockSync } from "./clock-sync";

const TIME_SYNC_INTERVAL_MS = 15000;

type PlaybackHandler = (event: PlayEvent | PauseEvent | SeekEvent) => void;
type HeartbeatHandler = (event: HeartbeatEvent) => void;
type PresenceHandler = (event: PresenceUpdate) => void;

export class RoomSocket {
  private socket: Socket | null = null;
  readonly clockSync = new ClockSync();
  private timeSyncTimer: ReturnType<typeof setInterval> | null = null;

  connect(): Socket {
    if (this.socket) return this.socket;
    // socket.io-client connects to the current page's origin when given no URL at all — passing
    // an empty string explicitly isn't the same thing, so this has to be `undefined`, not "".
    this.socket = io(API_ORIGIN || undefined, { withCredentials: true, transports: ["websocket"] });

    this.socket.on("connect", () => this.startTimeSync());
    return this.socket;
  }

  private startTimeSync() {
    const ping = () => {
      const clientSentMs = Date.now();
      this.socket?.emit(SocketEvents.TimeSync, { clientSentMs });
    };
    this.socket?.on(SocketEvents.TimeSync, (payload: { clientSentMs: number; serverTimeMs: number }) => {
      this.clockSync.recordSample(payload.clientSentMs, payload.serverTimeMs, Date.now());
    });
    ping();
    this.timeSyncTimer = setInterval(ping, TIME_SYNC_INTERVAL_MS);
  }

  joinRoom(
    roomId: string,
  ): Promise<
    { playback: { status: "playing" | "paused"; positionSec: number; updatedAtMs: number } } | { error: string }
  > {
    return new Promise((resolve) => {
      this.socket?.emit(SocketEvents.RoomJoin, { roomId }, resolve);
    });
  }

  leaveRoom(roomId: string): void {
    this.socket?.emit(SocketEvents.RoomLeave, { roomId });
  }

  emitPlay(event: PlayEvent & { roomId: string }): void {
    this.socket?.emit(SocketEvents.PlayerPlay, event);
  }

  emitPause(event: PauseEvent & { roomId: string }): void {
    this.socket?.emit(SocketEvents.PlayerPause, event);
  }

  emitSeek(event: SeekEvent & { roomId: string }): void {
    this.socket?.emit(SocketEvents.PlayerSeek, event);
  }

  onPlay(handler: PlaybackHandler): void {
    this.socket?.on(SocketEvents.PlayerPlay, handler);
  }

  onPause(handler: PlaybackHandler): void {
    this.socket?.on(SocketEvents.PlayerPause, handler);
  }

  onSeek(handler: PlaybackHandler): void {
    this.socket?.on(SocketEvents.PlayerSeek, handler);
  }

  onHeartbeat(handler: HeartbeatHandler): void {
    this.socket?.on(SocketEvents.PlayerHeartbeat, handler);
  }

  onPresence(handler: PresenceHandler): void {
    this.socket?.on(SocketEvents.PresenceUpdate, handler);
  }

  disconnect(): void {
    if (this.timeSyncTimer) clearInterval(this.timeSyncTimer);
    this.socket?.disconnect();
    this.socket = null;
  }
}

// One connection for the whole app — the store and the room view share it rather than each
// opening their own socket.
export const roomSocket = new RoomSocket();
