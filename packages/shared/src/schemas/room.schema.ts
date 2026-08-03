import { z } from "zod";

export const CreateRoomSchema = z.object({
  name: z.string().min(1).max(80),
});
export type CreateRoomDto = z.infer<typeof CreateRoomSchema>;

export const RoomMemberSchema = z.object({
  userId: z.string().uuid(),
  displayName: z.string(),
  role: z.enum(["owner", "member"]),
  joinedAt: z.string().datetime(),
});
export type RoomMemberDto = z.infer<typeof RoomMemberSchema>;

export const RoomSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  ownerId: z.string().uuid(),
  isActive: z.boolean(),
  createdAt: z.string().datetime(),
  members: z.array(RoomMemberSchema),
});
export type RoomDto = z.infer<typeof RoomSchema>;
