import type { VideoAssetDto } from "@watch-party/shared";
import type { VideoAsset } from "../../database/schema";

export function toVideoAssetDto(asset: VideoAsset): VideoAssetDto {
  return {
    id: asset.id,
    kind: asset.kind,
    status: asset.status,
    playbackUrl: asset.status === "ready" ? `/api/video/proxy/${asset.id}/playlist.m3u8` : null,
    failureReason: asset.failureReason,
    title: asset.title,
  };
}
