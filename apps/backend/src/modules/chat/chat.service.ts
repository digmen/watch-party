import { Inject, Injectable } from "@nestjs/common";
import { desc, eq } from "drizzle-orm";
import { DRIZZLE_CLIENT, type DrizzleDb } from "../../database/drizzle.module";
import { type RoomMessage, roomMessages, users } from "../../database/schema";

export interface RoomMessageRow {
  message: RoomMessage;
  displayName: string;
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

    return rows.reverse(); // oldest first, matching how a chat log reads
  }

  async post(roomId: string, userId: string, body: string): Promise<RoomMessageRow> {
    const [message] = await this.db.insert(roomMessages).values({ roomId, userId, body }).returning();
    const [user] = await this.db.select({ displayName: users.displayName }).from(users).where(eq(users.id, userId));
    return { message, displayName: user.displayName };
  }
}
