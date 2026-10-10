import { randomUUID } from "node:crypto";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import {
  ConnectedSocket,
  MessageBody,
  type OnGatewayDisconnect,
  type OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import {
  type PauseEvent,
  type PlayEvent,
  type QueueItemDto,
  type SeekEvent,
  SendChatMessageSchema,
  SocketEvents,
  type TimeSyncRequest,
} from "@watch-party/shared";
import type { Server, Socket } from "socket.io";
import type { Env } from "../../config/env.schema";
import { toChatMessageDto } from "../chat/chat.presenter";
import { ChatService } from "../chat/chat.service";
import { RoomsService } from "../rooms/rooms.service";
import { PlaybackStateService } from "./playback-state.service";
import { PresenceService } from "./presence.service";
import { parseCookieHeader } from "./socket-cookie.util";
import { StallService } from "./stall.service";

// Overridable so tests can make the heartbeat fire constantly and flush out races with pause/seek.
const HEARTBEAT_INTERVAL_MS = Number(process.env.HEARTBEAT_INTERVAL_MS ?? 7000);
const HEARTBEAT_LOCK_TTL_SEC = 5;
// How long a video hand-over waits for slow viewers before the room starts anyway.
const AUTOPLAY_WAIT_MS = 15_000;

interface SocketData {
  userId: string;
  displayName: string;
  isGuest: boolean;
}

// Every viewer computes "where should I be" as position + (their server-corrected clock - the
// event's timestamp). So the timestamp has to be on the SERVER clock: stamping it with the sender's
// own Date.now() makes everyone's position wrong by exactly that machine's clock error — a viewer
// whose clock is two minutes off would freeze the whole room at 0:00 for two minutes.
function stampWithServerTime<T extends { originTimestampMs: number }>(body: T): T {
  return { ...body, originTimestampMs: Date.now() };
}

@WebSocketGateway()
export class RoomGateway implements OnGatewayInit, OnGatewayDisconnect {
  @WebSocketServer() server!: Server;

  private readonly instanceId = randomUUID();
  private readonly localActiveRooms = new Set<string>();
  private endedHandler?: (roomId: string, assetId: string) => Promise<void>;

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
    private readonly rooms: RoomsService,
    private readonly presence: PresenceService,
    private readonly playbackState: PlaybackStateService,
    private readonly stall: StallService,
    private readonly chat: ChatService,
  ) {}

  afterInit(server: Server) {
    server.use(async (socket, next) => {
      try {
        const cookies = parseCookieHeader(socket.handshake.headers.cookie);
        const token = cookies["access_token"];
        if (!token) throw new Error("missing access_token cookie");

        const payload = await this.jwt.verifyAsync<{ sub: string; isGuest?: boolean }>(token, {
          secret: this.config.get("JWT_ACCESS_SECRET", { infer: true }),
        });
        const data = socket.data as SocketData;
        data.userId = payload.sub;
        data.isGuest = payload.isGuest === true;
        next();
      } catch {
        next(new Error("unauthorized"));
      }
    });

    // See presence.service.ts / playback-state.service.ts for why this design (Redis as shared
    // truth, a per-tick NX lock) is what keeps a multi-replica deployment from broadcasting the
    // same heartbeat N times — only whichever instance wins the lock for this tick emits.
    setInterval(() => this.tickHeartbeats(), HEARTBEAT_INTERVAL_MS);
  }

  private async tickHeartbeats() {
    for (const roomId of this.localActiveRooms) {
      // Expired stall entries must not freeze a room forever.
      if (await this.stall.isAutoPaused(roomId)) await this.settleStall(roomId, "system");
      await this.maybeAutoplay(roomId);
      // Somebody sitting in the room keeps it alive even when nothing is being pressed.
      if ((await this.presence.listMembers(roomId)).length > 0) await this.rooms.touch(roomId);
      const state = await this.playbackState.get(roomId);
      if (state.status !== "playing") continue;

      const acquired = await this.playbackState.tryAcquireHeartbeatLock(
        roomId,
        this.instanceId,
        HEARTBEAT_LOCK_TTL_SEC,
      );
      if (!acquired) continue; // another instance already ticked this room this cycle

      // Re-read AFTER the lock: the state read above may be stale by now (someone paused while we
      // waited), and broadcasting it with a fresh timestamp used to bring a paused room back to life.
      const fresh = await this.playbackState.get(roomId);
      if (fresh.status !== "playing") continue;
      const now = Date.now();
      this.server.to(roomId).emit(SocketEvents.PlayerHeartbeat, {
        positionSec: this.playbackState.projectedPosition(fresh, now),
        serverTimestampMs: now,
        status: fresh.status,
        version: fresh.version,
      });
    }
  }

  async handleDisconnect(@ConnectedSocket() socket: Socket) {
    const data = socket.data as SocketData;
    for (const roomId of socket.rooms) {
      if (roomId === socket.id) continue;
      await this.presence.removeSocket(roomId, socket.id);
      await this.broadcastPresence(roomId);
      // Someone who disconnects mid-stall must not keep the room frozen.
      await this.stall.remove(roomId, data.userId);
      await this.settleStall(roomId, data.userId);
    }
  }

  @SubscribeMessage(SocketEvents.RoomJoin)
  async onRoomJoin(@ConnectedSocket() socket: Socket, @MessageBody() body: { roomId: string }) {
    const userId = (socket.data as SocketData).userId;
    const isMember = await this.rooms.isMember(body.roomId, userId);
    if (!isMember) return { error: "not a member of this room" };

    const room = await this.rooms.findById(body.roomId);
    await socket.join(body.roomId);
    this.localActiveRooms.add(body.roomId);
    await this.rooms.touch(body.roomId);
    await this.presence.addSocket(body.roomId, socket.id, {
      userId,
      displayName: (await this.rooms.listMembers(body.roomId)).find((m) => m.userId === userId)?.displayName ?? "?",
    });
    await this.broadcastPresence(body.roomId);

    const state = await this.playbackState.get(body.roomId);
    return { room: room.id, playback: state };
  }

  @SubscribeMessage(SocketEvents.RoomLeave)
  async onRoomLeave(@ConnectedSocket() socket: Socket, @MessageBody() body: { roomId: string }) {
    await socket.leave(body.roomId);
    await this.presence.removeSocket(body.roomId, socket.id);
    await this.broadcastPresence(body.roomId);
  }

  @SubscribeMessage(SocketEvents.PlayerPlay)
  async onPlay(@ConnectedSocket() socket: Socket, @MessageBody() body: { roomId: string } & PlayEvent) {
    if (!(await this.rooms.isMember(body.roomId, (socket.data as SocketData).userId))) return;
    const stamped = stampWithServerTime(body);
    await this.stall.clearAutoPaused(body.roomId); // a person decided: the system hold no longer applies
    await this.stall.clearAutoplay(body.roomId);
    const next = await this.playbackState.set(body.roomId, {
      status: "playing",
      positionSec: body.positionSec,
      updatedAtMs: stamped.originTimestampMs,
    });
    this.server.to(body.roomId).emit(SocketEvents.PlayerPlay, { ...stamped, version: next.version });
  }

  @SubscribeMessage(SocketEvents.PlayerPause)
  async onPause(@ConnectedSocket() socket: Socket, @MessageBody() body: { roomId: string } & PauseEvent) {
    if (!(await this.rooms.isMember(body.roomId, (socket.data as SocketData).userId))) return;
    const stamped = stampWithServerTime(body);
    await this.stall.clearAutoPaused(body.roomId); // a person paused: do not auto-resume behind their back
    const next = await this.playbackState.set(body.roomId, {
      status: "paused",
      positionSec: body.positionSec,
      updatedAtMs: stamped.originTimestampMs,
    });
    this.server.to(body.roomId).emit(SocketEvents.PlayerPause, { ...stamped, version: next.version });
  }

  @SubscribeMessage(SocketEvents.PlayerSeek)
  async onSeek(@ConnectedSocket() socket: Socket, @MessageBody() body: { roomId: string } & SeekEvent) {
    if (!(await this.rooms.isMember(body.roomId, (socket.data as SocketData).userId))) return;
    const current = await this.playbackState.get(body.roomId);
    const stamped = stampWithServerTime(body);
    const next = await this.playbackState.set(body.roomId, {
      status: current.status,
      positionSec: body.positionSec,
      updatedAtMs: stamped.originTimestampMs,
    });
    this.server.to(body.roomId).emit(SocketEvents.PlayerSeek, { ...stamped, version: next.version });
  }

  // A viewer's buffer ran dry (stalled=true) or recovered (stalled=false). While anyone is waiting
  // the room is held paused at the exact position everyone had reached; it resumes on its own.
  @SubscribeMessage(SocketEvents.PlayerStall)
  async onStall(@ConnectedSocket() socket: Socket, @MessageBody() body: { roomId: string; stalled: boolean }) {
    const userId = (socket.data as SocketData).userId;
    if (!(await this.rooms.isMember(body.roomId, userId))) return;

    if (!body.stalled) {
      await this.stall.remove(body.roomId, userId);
      await this.settleStall(body.roomId, userId);
      return;
    }

    const name = (await this.rooms.listMembers(body.roomId)).find((m) => m.userId === userId)?.displayName ?? "?";
    await this.stall.add(body.roomId, userId, name);

    const state = await this.playbackState.get(body.roomId);
    if (state.status === "playing") {
      const now = Date.now();
      const positionSec = this.playbackState.projectedPosition(state, now);
      const next = await this.playbackState.set(body.roomId, { status: "paused", positionSec, updatedAtMs: now });
      await this.stall.markAutoPaused(body.roomId, next.version);
      this.server.to(body.roomId).emit(SocketEvents.PlayerPause, {
        positionSec,
        originTimestampMs: now,
        byUserId: userId,
        version: next.version,
      });
    }
    await this.broadcastStall(body.roomId);
  }

  // Called whenever a staller leaves the list: tells everybody who is still being waited for and,
  // once nobody is, resumes a room that this mechanism (not a person) paused.
  private async settleStall(roomId: string, byUserId: string): Promise<void> {
    const waiting = await this.stall.active(roomId);
    if (waiting.length === 0) {
      const heldVersion = await this.stall.consumeAutoPaused(roomId);
      const state = await this.playbackState.get(roomId);
      // Resume only a room the SYSTEM paused and nobody has touched since; if a person pressed
      // anything in between, their choice stands.
      if (heldVersion !== null && state.version === heldVersion && state.status === "paused") {
        const now = Date.now();
        const next = await this.playbackState.set(roomId, {
          status: "playing",
          positionSec: state.positionSec,
          updatedAtMs: now,
        });
        this.server.to(roomId).emit(SocketEvents.PlayerPlay, {
          positionSec: state.positionSec,
          originTimestampMs: now,
          byUserId,
          version: next.version,
        });
      }
    }
    await this.broadcastStall(roomId);
  }

  private async broadcastStall(roomId: string): Promise<void> {
    const waiting = await this.stall.active(roomId);
    this.server.to(roomId).emit(SocketEvents.RoomStall, { roomId, waitingFor: waiting.map((w) => w.name) });
  }

  @SubscribeMessage(SocketEvents.TimeSync)
  onTimeSync(@ConnectedSocket() socket: Socket, @MessageBody() body: TimeSyncRequest) {
    socket.emit(SocketEvents.TimeSync, { clientSentMs: body.clientSentMs, serverTimeMs: Date.now() });
  }

  // "X is typing…" is relayed to everybody else in the room; nothing is stored.
  @SubscribeMessage(SocketEvents.ChatTyping)
  async onChatTyping(@ConnectedSocket() socket: Socket, @MessageBody() body: { roomId: string }) {
    const userId = (socket.data as SocketData).userId;
    if (!(await this.rooms.isMember(body.roomId, userId))) return;
    const name = (await this.rooms.listMembers(body.roomId)).find((m) => m.userId === userId)?.displayName ?? "?";
    socket.to(body.roomId).emit(SocketEvents.ChatTyping, { roomId: body.roomId, userId, displayName: name });
  }

  @SubscribeMessage(SocketEvents.ChatMessage)
  async onChatMessage(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: { roomId: string; body: string; replyToId?: string },
  ) {
    const userId = (socket.data as SocketData).userId;
    if (!(await this.rooms.isMember(body.roomId, userId))) return;

    const parsed = SendChatMessageSchema.safeParse({ body: body.body, replyToId: body.replyToId });
    if (!parsed.success) return;

    await this.rooms.touch(body.roomId);
    const row = await this.chat.post(body.roomId, userId, parsed.data.body, parsed.data.replyToId);
    this.server.to(body.roomId).emit(SocketEvents.ChatMessage, toChatMessageDto(row));
  }

  // The room's queue changed (something added, removed, reordered or the current video moved on).
  broadcastQueue(roomId: string, items: QueueItemDto[]): void {
    this.server.to(roomId).emit(SocketEvents.QueueUpdated, { roomId, items });
  }

  // VideoService registers itself here: the gateway cannot import it (cycle), but it must be able to
  // say "the current video ended".
  setEndedHandler(handler: (roomId: string, assetId: string) => Promise<void>): void {
    this.endedHandler = handler;
  }

  async claimAdvance(roomId: string, itemId: string): Promise<boolean> {
    return this.stall.claimOnce(`advance:${roomId}:${itemId}`, 60);
  }

  // After one video hands over to the next the room waits (at most 15 s) until everybody online has
  // the first seconds buffered, then starts by itself — nobody should miss the opening.
  async armAutoplay(roomId: string, assetId: string): Promise<void> {
    const state = await this.playbackState.get(roomId);
    await this.stall.armAutoplay(roomId, {
      assetId,
      deadlineMs: Date.now() + AUTOPLAY_WAIT_MS,
      version: state.version,
    });
    setTimeout(() => void this.maybeAutoplay(roomId), AUTOPLAY_WAIT_MS + 500);
  }

  private async maybeAutoplay(roomId: string): Promise<void> {
    const plan = await this.stall.getAutoplay(roomId);
    if (!plan) return;
    const online = new Set((await this.presence.listMembers(roomId)).map((m) => m.userId));
    const ready = await this.stall.readyUsers(roomId, plan.assetId);
    const everyoneReady = online.size > 0 && [...online].every((id) => ready.has(id));
    if (!everyoneReady && Date.now() < plan.deadlineMs) return;
    if (!(await this.stall.takeAutoplay(roomId))) return; // someone else already started it
    const state = await this.playbackState.get(roomId);
    // Only if nobody has touched the room since the switch.
    if (state.version !== plan.version || state.status !== "paused") return;
    const now = Date.now();
    const next = await this.playbackState.set(roomId, { status: "playing", positionSec: 0, updatedAtMs: now });
    this.server.to(roomId).emit(SocketEvents.PlayerPlay, {
      positionSec: 0,
      originTimestampMs: now,
      byUserId: "00000000-0000-0000-0000-000000000000",
      version: next.version,
    });
  }

  @SubscribeMessage(SocketEvents.PlayerReady)
  async onReady(@ConnectedSocket() socket: Socket, @MessageBody() body: { roomId: string; assetId: string }) {
    const userId = (socket.data as SocketData).userId;
    if (!(await this.rooms.isMember(body.roomId, userId))) return;
    await this.stall.markReady(body.roomId, body.assetId, userId);
    await this.maybeAutoplay(body.roomId);
  }

  @SubscribeMessage(SocketEvents.PlayerEnded)
  async onEnded(@ConnectedSocket() socket: Socket, @MessageBody() body: { roomId: string; assetId: string }) {
    const userId = (socket.data as SocketData).userId;
    if (!(await this.rooms.isMember(body.roomId, userId))) return;
    await this.endedHandler?.(body.roomId, body.assetId);
  }

  // A different video starts at 0:00, stopped, with nobody being waited for — never at the place the
  // previous film happened to be.
  async resetPlayback(roomId: string): Promise<void> {
    await this.stall.clearAll(roomId);
    const now = Date.now();
    const next = await this.playbackState.set(roomId, { status: "paused", positionSec: 0, updatedAtMs: now });
    this.server.to(roomId).emit(SocketEvents.PlayerPause, {
      positionSec: 0,
      originTimestampMs: now,
      byUserId: "00000000-0000-0000-0000-000000000000",
      version: next.version,
    });
    this.server.to(roomId).emit(SocketEvents.RoomStall, { roomId, waitingFor: [] });
  }

  // Called from the video pipeline (VideoService on add, VideoPrefetchProcessor once an asset is
  // ready) so everyone already sitting in the room switches over without reloading.
  broadcastVideoChanged(roomId: string, video: unknown): void {
    this.server.to(roomId).emit(SocketEvents.VideoChanged, video);
  }

  private async broadcastPresence(roomId: string) {
    const members = await this.presence.listMembers(roomId);
    this.server.to(roomId).emit(SocketEvents.PresenceUpdate, { roomId, members });
  }
}
