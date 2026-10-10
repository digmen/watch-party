import { z } from "zod";

export const QueueItemStatusSchema = z.enum(["queued", "playing", "done"]);

// One entry of a room's video queue. `playing` is the current video (at most one per room).
export const QueueItemSchema = z.object({
  id: z.string().uuid(),
  assetId: z.string().uuid(),
  status: QueueItemStatusSchema,
  position: z.number().int(),
  title: z.string().nullable(),
  sourceUrl: z.string(),
  assetStatus: z.enum(["pending", "processing", "ready", "failed"]),
  addedByName: z.string(),
  addedById: z.string().uuid(),
});
export type QueueItemDto = z.infer<typeof QueueItemSchema>;

export const QueueSchema = z.object({
  roomId: z.string().uuid(),
  items: z.array(QueueItemSchema),
});
export type QueueDto = z.infer<typeof QueueSchema>;

export const ReorderQueueSchema = z.object({
  order: z.array(z.string().uuid()).min(1).max(200),
});
export type ReorderQueueDto = z.infer<typeof ReorderQueueSchema>;
