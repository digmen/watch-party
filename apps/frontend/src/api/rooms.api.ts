import type { CreateRoomDto, RoomDto } from "@watch-party/shared";
import { apiFetch } from "./client";

export const roomsApi = {
  list: () => apiFetch<{ rooms: RoomDto[] }>("/rooms"),
  create: (dto: CreateRoomDto) => apiFetch<{ room: RoomDto }>("/rooms", { method: "POST", body: dto }),
  get: (id: string) => apiFetch<{ room: RoomDto }>(`/rooms/${id}`),
  join: (id: string) => apiFetch<{ room: RoomDto }>(`/rooms/${id}/join`, { method: "POST" }),
  leave: (id: string) => apiFetch<{ ok: true }>(`/rooms/${id}/leave`, { method: "POST" }),
};
