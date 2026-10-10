import type { AddVideoDto, VideoAssetDto } from "@watch-party/shared";
import { apiFetch } from "./client";

export const videosApi = {
  add: (roomId: string, dto: AddVideoDto) =>
    apiFetch<{ video: VideoAssetDto; becameCurrent: boolean }>(`/rooms/${roomId}/videos`, {
      method: "POST",
      body: dto,
    }),
  latestForRoom: (roomId: string) => apiFetch<{ video: VideoAssetDto | null }>(`/rooms/${roomId}/videos/latest`),
  getStatus: (assetId: string) => apiFetch<{ video: VideoAssetDto }>(`/video/assets/${assetId}`),
};
