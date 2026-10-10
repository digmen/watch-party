import type { ChatMessageDto } from "@watch-party/shared";
import type { RoomMessageRow } from "./chat.service";

export function toChatMessageDto(row: RoomMessageRow): ChatMessageDto {
  return {
    id: row.message.id,
    roomId: row.message.roomId,
    userId: row.message.userId,
    displayName: row.displayName,
    body: row.message.body,
    createdAt: row.message.createdAt.toISOString(),
    replyTo: row.replyTo
      ? {
          id: row.replyTo.id,
          displayName: row.replyTo.displayName,
          snippet: row.replyTo.body.length > 120 ? `${row.replyTo.body.slice(0, 117)}…` : row.replyTo.body,
        }
      : null,
  };
}
