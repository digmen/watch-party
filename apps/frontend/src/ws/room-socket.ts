import {
  type ChatMessageDto,
  type HeartbeatEvent,
  type PauseEvent,
  type PlayEvent,
  type PresenceUpdate,
  type QueueItemDto,
  type SeekEvent,
  SocketEvents,
  type VideoAssetDto,
} from "@watch-party/shared";
import { io, type Socket } from "socket.io-client";
import { API_ORIGIN, refreshSession } from "../api/client";
import { ClockSync } from "./clock-sync";

const TIME_SYNC_INTERVAL_MS = 15000;

type PlaybackHandler = (event: PlayEvent | PauseEvent | SeekEvent) => void;
type HeartbeatHandler = (event: HeartbeatEvent) => void;
type PresenceHandler = (event: PresenceUpdate) => void;
type ChatHandler = (message: ChatMessageDto) => void;
type VideoChangedHandler = (video: VideoAssetDto) => void;
type RejoinResult = { playback: { status: "playing" | "paused"; positionSec: number; updatedAtMs: number } };
type QueueHandler = (event: { roomId: string; items: QueueItemDto[] }) => void;
type StallHandler = (event: { roomId: string; waitingFor: string[] }) => void;

export class RoomSocket {
  private socket: Socket | null = null;
  readonly clockSync = new ClockSync();
  private timeSyncTimer: ReturnType<typeof setInterval> | null = null;
  // socket.io fires connect_error on every retry attempt; without this latch a failing
  // reconnect would queue a refresh per attempt and rotate the refresh token against itself.
  private reconnectRefreshInFlight = false;
  // After any network drop socket.io hands us a NEW socket id, and the server only delivers room
  // events to sockets that joined the room — so the room must be joined again on every reconnect.
  // Without this, one metro tunnel or Wi-Fi/LTE switch silently ended synchronisation for good.
  private currentRoomId: string | null = null;
  private hasConnectedBefore = false;
  private timeSyncListening = false;
  private reconnectHandlers: Array<(playback: RejoinResult | null) => void> = [];

  connect(): Socket {
    if (this.socket) return this.socket;
    // socket.io-client connects to the current page's origin when given no URL at all — passing
    // an empty string explicitly isn't the same thing, so this has to be `undefined`, not "".
    this.socket = io(API_ORIGIN || undefined, { withCredentials: true, transports: ["websocket"] });

    this.socket.on("connect", () => {
      this.startTimeSync();
      if (this.hasConnectedBefore && this.currentRoomId) void this.rejoin(this.currentRoomId);
      this.hasConnectedBefore = true;
    });

    // The server may close the socket itself (expired token, restart); socket.io does not retry that.
    this.socket.on("disconnect", (reason) => {
      if (reason === "io server disconnect") this.socket?.connect();
    });

    // The handshake authenticates from the access-token cookie, which expires after 15 minutes.
    // A room that is simply playing a film issues no HTTP requests for hours, so nothing else
    // refreshes that cookie — meaning any reconnect past the 15-minute mark is rejected and
    // socket.io then retries forever with the same dead token. Guests live in exactly that state
    // for a whole movie, so this is the difference between "sync survives a blip" and "sync
    // silently dies partway through".
    this.socket.on("connect_error", async () => {
      if (this.reconnectRefreshInFlight) return;
      this.reconnectRefreshInFlight = true;
      try {
        if (await refreshSession()) this.socket?.connect();
      } finally {
        this.reconnectRefreshInFlight = false;
      }
    });

    return this.socket;
  }

  private startTimeSync() {
    const ping = () => {
      const clientSentMs = Date.now();
      this.socket?.emit(SocketEvents.TimeSync, { clientSentMs });
    };
    // Listener and timer are set up once per socket / replaced per connect — not stacked on every reconnect.
    if (!this.timeSyncListening) {
      this.socket?.on(SocketEvents.TimeSync, (payload: { clientSentMs: number; serverTimeMs: number }) => {
        this.clockSync.recordSample(payload.clientSentMs, payload.serverTimeMs, Date.now());
      });
      this.timeSyncListening = true;
    }
    if (this.timeSyncTimer) clearInterval(this.timeSyncTimer);
    ping();
    this.timeSyncTimer = setInterval(ping, TIME_SYNC_INTERVAL_MS);
  }

  joinRoom(roomId: string): Promise<RejoinResult | { error: string }> {
    this.currentRoomId = roomId;
    return new Promise((resolve) => {
      this.socket?.emit(SocketEvents.RoomJoin, { roomId }, resolve);
    });
  }

  private async rejoin(roomId: string): Promise<void> {
    const result = await this.joinRoom(roomId);
    const playback = "playback" in result ? result : null;
    for (const handler of this.reconnectHandlers) handler(playback);
  }

  // Called after every successful automatic re-join, with the room's current playback state.
  onReconnect(handler: (playback: RejoinResult | null) => void): void {
    this.reconnectHandlers.push(handler);
  }

  leaveRoom(roomId: string): void {
    this.socket?.emit(SocketEvents.RoomLeave, { roomId });
    if (this.currentRoomId === roomId) this.currentRoomId = null;
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

  emitReady(roomId: string, assetId: string): void {
    this.socket?.emit(SocketEvents.PlayerReady, { roomId, assetId });
  }

  emitEnded(roomId: string, assetId: string): void {
    this.socket?.emit(SocketEvents.PlayerEnded, { roomId, assetId });
  }

  onQueueUpdated(handler: QueueHandler): void {
    this.socket?.on(SocketEvents.QueueUpdated, handler);
  }

  emitStall(roomId: string, stalled: boolean): void {
    this.socket?.emit(SocketEvents.PlayerStall, { roomId, stalled });
  }

  onRoomStall(handler: StallHandler): void {
    this.socket?.on(SocketEvents.RoomStall, handler);
  }

  sendChatMessage(roomId: string, body: string): void {
    this.socket?.emit(SocketEvents.ChatMessage, { roomId, body });
  }

  onChatMessage(handler: ChatHandler): void {
    this.socket?.on(SocketEvents.ChatMessage, handler);
  }

  onVideoChanged(handler: VideoChangedHandler): void {
    this.socket?.on(SocketEvents.VideoChanged, handler);
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
    this.currentRoomId = null;
    this.hasConnectedBefore = false;
    this.timeSyncListening = false;
    this.reconnectHandlers = [];
  }
}

// One connection for the whole app — the store and the room view share it rather than each
// opening their own socket.
export const roomSocket = new RoomSocket();
