export const SocketEvents = {
  RoomJoin: "room:join",
  RoomLeave: "room:leave",
  PresenceUpdate: "presence:update",
  PlayerPlay: "player:play",
  PlayerPause: "player:pause",
  PlayerSeek: "player:seek",
  PlayerHeartbeat: "player:heartbeat",
  // Client -> server: "my buffer ran dry" / "my buffer is healthy again". The server pauses the whole
  // room while anyone is waiting for data and resumes it when everybody has frames again.
  PlayerStall: "player:stall",
  // Server -> clients: who the room is currently waiting for (empty = nobody).
  RoomStall: "room:stall",
  TimeSync: "time:sync",
  ChatMessage: "chat:message",
  // Server -> clients when the room's current video is swapped or finishes preparing. Without it
  // the only way to learn about a new video was reloading the page — and a viewer who arrived
  // before any video existed would sit on a dead screen indefinitely.
  VideoChanged: "video:changed",
} as const;

export type SocketEventName = (typeof SocketEvents)[keyof typeof SocketEvents];
