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

const HEARTBEAT_INTERVAL_MS = 7000;
const HEARTBEAT_LOCK_TTL_SEC = 5;

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

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
    private readonly rooms: RoomsService,
    private readonly presence: PresenceService,
    private readonly playbackState: PlaybackStateService,
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
      const state = await this.playbackState.get(roomId);
      if (state.status !== "playing") continue;

      const acquired = await this.playbackState.tryAcquireHeartbeatLock(
        roomId,
        this.instanceId,
        HEARTBEAT_LOCK_TTL_SEC,
      );
      if (!acquired) continue; // another instance already ticked this room this cycle

      const now = Date.now();
      this.server.to(roomId).emit(SocketEvents.PlayerHeartbeat, {
        positionSec: this.playbackState.projectedPosition(state, now),
        serverTimestampMs: now,
        status: state.status,
      });
    }
  }

  async handleDisconnect(@ConnectedSocket() socket: Socket) {
    const data = socket.data as SocketData;
    for (const roomId of socket.rooms) {
      if (roomId === socket.id) continue;
      await this.presence.removeSocket(roomId, socket.id);
      await this.broadcastPresence(roomId);
    }
    void data;
  }

  @SubscribeMessage(SocketEvents.RoomJoin)
  async onRoomJoin(@ConnectedSocket() socket: Socket, @MessageBody() body: { roomId: string }) {
    const userId = (socket.data as SocketData).userId;
    const isMember = await this.rooms.isMember(body.roomId, userId);
    if (!isMember) return { error: "not a member of this room" };

    const room = await this.rooms.findById(body.roomId);
    await socket.join(body.roomId);
    this.localActiveRooms.add(body.roomId);
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
    await this.playbackState.set(body.roomId, {
      status: "playing",
      positionSec: body.positionSec,
      updatedAtMs: stamped.originTimestampMs,
    });
    this.server.to(body.roomId).emit(SocketEvents.PlayerPlay, stamped);
  }

  @SubscribeMessage(SocketEvents.PlayerPause)
  async onPause(@ConnectedSocket() socket: Socket, @MessageBody() body: { roomId: string } & PauseEvent) {
    if (!(await this.rooms.isMember(body.roomId, (socket.data as SocketData).userId))) return;
    const stamped = stampWithServerTime(body);
    await this.playbackState.set(body.roomId, {
      status: "paused",
      positionSec: body.positionSec,
      updatedAtMs: stamped.originTimestampMs,
    });
    this.server.to(body.roomId).emit(SocketEvents.PlayerPause, stamped);
  }

  @SubscribeMessage(SocketEvents.PlayerSeek)
  async onSeek(@ConnectedSocket() socket: Socket, @MessageBody() body: { roomId: string } & SeekEvent) {
    if (!(await this.rooms.isMember(body.roomId, (socket.data as SocketData).userId))) return;
    const current = await this.playbackState.get(body.roomId);
    const stamped = stampWithServerTime(body);
    await this.playbackState.set(body.roomId, {
      status: current.status,
      positionSec: body.positionSec,
      updatedAtMs: stamped.originTimestampMs,
    });
    this.server.to(body.roomId).emit(SocketEvents.PlayerSeek, stamped);
  }

  @SubscribeMessage(SocketEvents.TimeSync)
  onTimeSync(@ConnectedSocket() socket: Socket, @MessageBody() body: TimeSyncRequest) {
    socket.emit(SocketEvents.TimeSync, { clientSentMs: body.clientSentMs, serverTimeMs: Date.now() });
  }

  @SubscribeMessage(SocketEvents.ChatMessage)
  async onChatMessage(@ConnectedSocket() socket: Socket, @MessageBody() body: { roomId: string; body: string }) {
    const userId = (socket.data as SocketData).userId;
    if (!(await this.rooms.isMember(body.roomId, userId))) return;

    const parsed = SendChatMessageSchema.safeParse({ body: body.body });
    if (!parsed.success) return;

    const row = await this.chat.post(body.roomId, userId, parsed.data.body);
    this.server.to(body.roomId).emit(SocketEvents.ChatMessage, toChatMessageDto(row));
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
