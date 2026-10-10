import type { ChatMessageDto } from "@watch-party/shared";
import { defineStore } from "pinia";
import { chatApi } from "../api/chat.api";
import { roomSocket } from "../ws/room-socket";

interface ChatState {
  roomId: string | null;
  messages: ChatMessageDto[];
  // Who is typing right now: userId -> name + when the last keystroke arrived.
  typing: Record<string, { name: string; at: number }>;
}

let lastTypingSent = 0;

export const useChatStore = defineStore("chat", {
  state: (): ChatState => ({ roomId: null, messages: [], typing: {} }),

  actions: {
    async enterRoom(roomId: string) {
      this.roomId = roomId;
      const { messages } = await chatApi.history(roomId);
      this.messages = messages;
      roomSocket.onChatTyping((event) => {
        if (event.roomId === this.roomId) this.typing[event.userId] = { name: event.displayName, at: Date.now() };
      });
      roomSocket.onChatMessage((message) => {
        // Whoever just wrote is no longer "typing".
        delete this.typing[message.userId];
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

    send(body: string, replyToId?: string) {
      if (!this.roomId || !body.trim()) return;
      roomSocket.sendChatMessage(this.roomId, body.trim(), replyToId);
    },

    // Called on keystrokes; at most one event per 2 s leaves the browser.
    notifyTyping() {
      const now = Date.now();
      if (!this.roomId || now - lastTypingSent < 2000) return;
      lastTypingSent = now;
      roomSocket.emitTyping(this.roomId);
    },

    leaveRoom() {
      this.roomId = null;
      this.messages = [];
      this.typing = {};
    },
  },
});
