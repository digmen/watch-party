import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq, inArray } from "drizzle-orm";
import { DRIZZLE_CLIENT, type DrizzleDb } from "../../database/drizzle.module";
import { type RoomMessage, roomMessages, users } from "../../database/schema";

export interface RoomMessageRow {
  message: RoomMessage;
  displayName: string;
  replyTo: { id: string; displayName: string; body: string } | null;
}

const HISTORY_LIMIT = 50;

@Injectable()
export class ChatService {
  constructor(@Inject(DRIZZLE_CLIENT) private readonly db: DrizzleDb) {}

  async listRecent(roomId: string): Promise<RoomMessageRow[]> {
    const rows = await this.db
      .select({ message: roomMessages, displayName: users.displayName })
      .from(roomMessages)
      .innerJoin(users, eq(roomMessages.userId, users.id))
      .where(eq(roomMessages.roomId, roomId))
      .orderBy(desc(roomMessages.createdAt))
      .limit(HISTORY_LIMIT);

    return this.withReplies(rows.reverse()); // oldest first, matching how a chat log reads
  }

  // Quotes are resolved on the way out, so editing nothing in storage but one nullable column.
  private async withReplies(rows: Array<{ message: RoomMessage; displayName: string }>): Promise<RoomMessageRow[]> {
    const ids = [...new Set(rows.map((r) => r.message.replyToId).filter((id): id is string => !!id))];
    const originals = new Map<string, { id: string; displayName: string; body: string }>();
    if (ids.length > 0) {
      const found = await this.db
        .select({ id: roomMessages.id, body: roomMessages.body, displayName: users.displayName })
        .from(roomMessages)
        .innerJoin(users, eq(roomMessages.userId, users.id))
        .where(inArray(roomMessages.id, ids));
      for (const f of found) originals.set(f.id, f);
    }
    return rows.map((r) => ({
      ...r,
      replyTo: r.message.replyToId ? (originals.get(r.message.replyToId) ?? null) : null,
    }));
  }

  async post(roomId: string, userId: string, body: string, replyToId?: string): Promise<RoomMessageRow> {
    // A reply only counts if the original is in THIS room; anything else is sent as a plain message.
    let validReplyId: string | null = null;
    if (replyToId) {
      const [original] = await this.db
        .select({ id: roomMessages.id })
        .from(roomMessages)
        .where(and(eq(roomMessages.id, replyToId), eq(roomMessages.roomId, roomId)))
        .limit(1);
      validReplyId = original?.id ?? null;
    }
    const [message] = await this.db
      .insert(roomMessages)
      .values({ roomId, userId, body, replyToId: validReplyId })
      .returning();
    const [user] = await this.db.select({ displayName: users.displayName }).from(users).where(eq(users.id, userId));
    const [row] = await this.withReplies([{ message, displayName: user.displayName }]);
    return row;
  }
}
