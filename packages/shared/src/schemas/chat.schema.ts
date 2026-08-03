import { z } from "zod";

export const SendChatMessageSchema = z.object({
  body: z.string().min(1).max(2000),
});
export type SendChatMessageDto = z.infer<typeof SendChatMessageSchema>;

export const ChatMessageSchema = z.object({
  id: z.string().uuid(),
  roomId: z.string().uuid(),
  userId: z.string().uuid(),
  displayName: z.string(),
  body: z.string(),
  createdAt: z.string().datetime(),
});
export type ChatMessageDto = z.infer<typeof ChatMessageSchema>;
