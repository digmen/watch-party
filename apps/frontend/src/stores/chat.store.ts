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
        if (message.roomId === this.roomId) this.messages.push(message);
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
