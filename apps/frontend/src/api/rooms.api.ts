import type { CreateRoomDto, PublicRoomDto, RoomDto, RoomPreviewDto, UpdateRoomDto } from "@watch-party/shared";
import { apiFetch } from "./client";

export const roomsApi = {
  list: () => apiFetch<{ rooms: RoomDto[] }>("/rooms"),
  create: (dto: CreateRoomDto) => apiFetch<{ room: RoomDto }>("/rooms", { method: "POST", body: dto }),
  get: (id: string) => apiFetch<{ room: RoomDto }>(`/rooms/${id}`),
  join: (id: string, password?: string) =>
    apiFetch<{ room: RoomDto }>(`/rooms/${id}/join`, { method: "POST", body: { password } }),
  update: (id: string, dto: UpdateRoomDto) =>
    apiFetch<{ room: RoomDto }>(`/rooms/${id}`, { method: "PATCH", body: dto }),
  leave: (id: string) => apiFetch<{ ok: true }>(`/rooms/${id}/leave`, { method: "POST" }),
  // Public: no session needed (landing page, /public, the password prompt).
  publicList: (limit: number, offset = 0) =>
    apiFetch<{ rooms: PublicRoomDto[] }>(`/public/rooms?limit=${limit}&offset=${offset}`),
  preview: (id: string) => apiFetch<{ room: RoomPreviewDto }>(`/public/rooms/${id}`),
};
