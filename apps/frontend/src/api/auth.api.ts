import type { GuestJoinDto, LoginDto, RegisterDto, RoomDto, UserDto } from "@watch-party/shared";
import { apiFetch } from "./client";

interface UserResponse {
  user: UserDto;
}

export const authApi = {
  register: (dto: RegisterDto) => apiFetch<UserResponse>("/auth/register", { method: "POST", body: dto }),
  login: (dto: LoginDto) => apiFetch<UserResponse>("/auth/login", { method: "POST", body: dto }),
  logout: () => apiFetch<{ ok: true }>("/auth/logout", { method: "POST" }),
  me: () => apiFetch<UserResponse>("/auth/me"),
  // Returns the room alongside the user: membership only exists once this resolves, so the client
  // couldn't fetch the room itself beforehand.
  joinAsGuest: (dto: GuestJoinDto) =>
    apiFetch<{ user: UserDto; room: RoomDto }>("/auth/guest", { method: "POST", body: dto }),
};
