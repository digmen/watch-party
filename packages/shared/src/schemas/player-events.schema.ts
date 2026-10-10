import { z } from "zod";

const BasePlayerEvent = z.object({
  positionSec: z.number().min(0),
  originTimestampMs: z.number(),
  byUserId: z.string().uuid(),
  // Monotonic per room: a client ignores anything older than the state it already holds, so a
  // late-arriving "playing" can never undo a newer pause.
  version: z.number().int().optional(),
});

export const PlayEventSchema = BasePlayerEvent;
export type PlayEvent = z.infer<typeof PlayEventSchema>;

export const PauseEventSchema = BasePlayerEvent;
export type PauseEvent = z.infer<typeof PauseEventSchema>;

export const SeekEventSchema = BasePlayerEvent;
export type SeekEvent = z.infer<typeof SeekEventSchema>;

export const HeartbeatEventSchema = z.object({
  positionSec: z.number().min(0),
  serverTimestampMs: z.number(),
  status: z.enum(["playing", "paused"]),
  version: z.number().int().optional(),
});
export type HeartbeatEvent = z.infer<typeof HeartbeatEventSchema>;

export const TimeSyncRequestSchema = z.object({
  clientSentMs: z.number(),
});
export type TimeSyncRequest = z.infer<typeof TimeSyncRequestSchema>;

export const TimeSyncResponseSchema = z.object({
  clientSentMs: z.number(),
  serverTimeMs: z.number(),
});
export type TimeSyncResponse = z.infer<typeof TimeSyncResponseSchema>;

export const PresenceMemberSchema = z.object({
  userId: z.string().uuid(),
  displayName: z.string(),
});
export type PresenceMember = z.infer<typeof PresenceMemberSchema>;

export const PresenceUpdateSchema = z.object({
  roomId: z.string().uuid(),
  members: z.array(PresenceMemberSchema),
});
export type PresenceUpdate = z.infer<typeof PresenceUpdateSchema>;
