import type { ChatMessageDto } from "@watch-party/shared";
import { apiFetch } from "./client";

export const chatApi = {
  history: (roomId: string) => apiFetch<{ messages: ChatMessageDto[] }>(`/rooms/${roomId}/messages`),
};
