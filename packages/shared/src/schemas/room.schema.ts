import { z } from "zod";

export const RoomVisibilitySchema = z.enum(["public", "private"]);
export type RoomVisibility = z.infer<typeof RoomVisibilitySchema>;

// Optional on purpose: an empty password means "link only". Capped at 72 chars (bcrypt-era habit,
// harmless for argon2) and never trimmed — whitespace can be part of a password.
export const RoomPasswordSchema = z.string().min(1).max(72);

export const CreateRoomSchema = z.object({
  name: z.string().min(1).max(80),
  visibility: RoomVisibilitySchema.default("private"),
  password: RoomPasswordSchema.optional(),
});
export type CreateRoomDto = z.input<typeof CreateRoomSchema>;

// Owner-only edit of how the room is reachable. `password: null` removes the password.
export const UpdateRoomSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  visibility: RoomVisibilitySchema.optional(),
  password: RoomPasswordSchema.nullable().optional(),
});
export type UpdateRoomDto = z.infer<typeof UpdateRoomSchema>;

export const JoinRoomSchema = z.object({
  password: RoomPasswordSchema.optional(),
});
export type JoinRoomDto = z.infer<typeof JoinRoomSchema>;

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
  visibility: RoomVisibilitySchema,
  hasPassword: z.boolean(),
  createdAt: z.string().datetime(),
  members: z.array(RoomMemberSchema),
});
export type RoomDto = z.infer<typeof RoomSchema>;

// What anyone (even signed out) may learn about a room: enough to show a password prompt or a
// list card, nothing about who is inside.
export const RoomPreviewSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  visibility: RoomVisibilitySchema,
  requiresPassword: z.boolean(),
});
export type RoomPreviewDto = z.infer<typeof RoomPreviewSchema>;

export const PublicRoomSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  hostName: z.string(),
  memberCount: z.number().int(),
  videoTitle: z.string().nullable(),
  requiresPassword: z.boolean(),
  createdAt: z.string().datetime(),
});
export type PublicRoomDto = z.infer<typeof PublicRoomSchema>;
