import { z } from "zod";

export const SendChatMessageSchema = z.object({
  body: z.string().min(1).max(2000),
  // The message this one answers (must belong to the same room; otherwise it is sent as a plain message).
  replyToId: z.string().uuid().optional(),
});
export type SendChatMessageDto = z.infer<typeof SendChatMessageSchema>;

export const ChatMessageSchema = z.object({
  id: z.string().uuid(),
  roomId: z.string().uuid(),
  userId: z.string().uuid(),
  displayName: z.string(),
  body: z.string(),
  createdAt: z.string().datetime(),
  replyTo: z
    .object({ id: z.string().uuid(), displayName: z.string(), snippet: z.string() })
    .nullable()
    .default(null),
});
export type ChatMessageDto = z.infer<typeof ChatMessageSchema>;
