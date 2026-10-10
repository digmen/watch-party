import type { QueueItemDto } from "@watch-party/shared";
import { apiFetch } from "./client";

export const queueApi = {
  list: (roomId: string) => apiFetch<{ roomId: string; items: QueueItemDto[] }>(`/rooms/${roomId}/queue`),
  next: (roomId: string) => apiFetch<{ advanced: boolean }>(`/rooms/${roomId}/queue/next`, { method: "POST" }),
  playNow: (roomId: string, itemId: string) =>
    apiFetch<{ ok: true }>(`/rooms/${roomId}/queue/${itemId}/play`, { method: "POST" }),
  remove: (roomId: string, itemId: string) =>
    apiFetch<{ ok: true }>(`/rooms/${roomId}/queue/${itemId}`, { method: "DELETE" }),
  reorder: (roomId: string, order: string[]) =>
    apiFetch<{ ok: true }>(`/rooms/${roomId}/queue/reorder`, { method: "POST", body: { order } }),
};
