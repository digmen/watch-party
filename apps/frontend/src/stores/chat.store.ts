import type { ChatMessageDto } from "@watch-party/shared";
import { defineStore } from "pinia";
import { chatApi } from "../api/chat.api";
import { roomSocket } from "../ws/room-socket";

interface ChatState {
  roomId: string | null;
  messages: ChatMessageDto[];
}

export const useChatStore = defineStore("chat", {
  state: (): ChatState => ({ roomId: null, messages: [] }),

  actions: {
    async enterRoom(roomId: string) {
      this.roomId = roomId;
      const { messages } = await chatApi.history(roomId);
      this.messages = messages;
      roomSocket.onChatMessage((message) => {
        if (message.roomId === this.roomId && !this.messages.some((m) => m.id === message.id))
          this.messages.push(message);
      });
      // Messages sent while this client was offline were never delivered to it: backfill from history.
      roomSocket.onReconnect(async () => {
        if (!this.roomId) return;
        try {
          const { messages } = await chatApi.history(this.roomId);
          const known = new Set(this.messages.map((m) => m.id));
          for (const m of messages) if (!known.has(m.id)) this.messages.push(m);
          this.messages.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
        } catch {
          // The next reconnect or a reload will catch up; chat is not worth an error toast.
        }
      });
    },

    send(body: string) {
      if (!this.roomId || !body.trim()) return;
      roomSocket.sendChatMessage(this.roomId, body.trim());
    },

    leaveRoom() {
      this.roomId = null;
      this.messages = [];
    },
  },
});
