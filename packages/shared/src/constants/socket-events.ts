export const SocketEvents = {
  RoomJoin: "room:join",
  RoomLeave: "room:leave",
  PresenceUpdate: "presence:update",
  PlayerPlay: "player:play",
  PlayerPause: "player:pause",
  PlayerSeek: "player:seek",
  PlayerHeartbeat: "player:heartbeat",
  TimeSync: "time:sync",
  ChatMessage: "chat:message",
} as const;

export type SocketEventName = (typeof SocketEvents)[keyof typeof SocketEvents];
