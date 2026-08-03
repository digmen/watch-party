import { z } from "zod";

export const AddVideoSchema = z.object({
  sourceUrl: z.string().url(),
});
export type AddVideoDto = z.infer<typeof AddVideoSchema>;

export const VideoAssetSchema = z.object({
  id: z.string().uuid(),
  kind: z.enum(["direct_mp4", "hls", "dash", "needs_extraction"]),
  status: z.enum(["pending", "processing", "ready", "failed"]),
  playbackUrl: z.string().nullable(),
  failureReason: z.string().nullable(),
});
export type VideoAssetDto = z.infer<typeof VideoAssetSchema>;
