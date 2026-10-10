import { z } from "zod";

export const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(72),
});
export type RegisterDto = z.infer<typeof RegisterSchema>;

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type LoginDto = z.infer<typeof LoginSchema>;

export const UserSchema = z.object({
  id: z.string().uuid(),
  // Null for guests — they join with a display name only (see GuestJoinSchema below).
  email: z.string().email().nullable(),
  displayName: z.string(),
  isGuest: z.boolean(),
  guestRoomId: z.string().uuid().nullable(),
  createdAt: z.string().datetime(),
});
export type UserDto = z.infer<typeof UserSchema>;

export const GuestJoinSchema = z.object({
  roomId: z.string().uuid(),
  // The \p{Cc}\p{Cf} block rejects control and format characters — zero-width joiners and
  // right-to-left overrides would otherwise let a guest render an invisible name, or spoof
  // someone else's, in the chat and presence list.
  displayName: z
    .string()
    .trim()
    .min(1)
    .max(32)
    .regex(/^[^\p{Cc}\p{Cf}]+$/u, "Имя содержит недопустимые символы"),
  // Only needed for rooms that have one; ignored otherwise.
  password: z.string().min(1).max(72).optional(),
});
export type GuestJoinDto = z.infer<typeof GuestJoinSchema>;

// A guest who starts their own room: no roomId yet (it is created by this call), and the room name
// is optional so the one-field "just start watching" flow works.
export const GuestStartSchema = z.object({
  displayName: GuestJoinSchema.shape.displayName,
  roomName: z.string().trim().min(1).max(80).optional(),
  visibility: z.enum(["public", "private"]).default("private"),
  password: z.string().min(1).max(72).optional(),
});
export type GuestStartDto = z.input<typeof GuestStartSchema>;
