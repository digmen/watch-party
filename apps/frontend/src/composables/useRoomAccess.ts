import type { RoomDto } from "@watch-party/shared";
import { ref } from "vue";
import { ApiError } from "../api/client";
import { roomsApi } from "../api/rooms.api";
import { humanize, useAuthStore } from "../stores/auth.store";
import { useChatStore } from "../stores/chat.store";
import { usePlayerStore } from "../stores/player.store";

// Getting into the room: preview (exists? password?), guest sign-in, password, join over HTTP, then
// the socket. `entered` turns true only after the socket has joined and the first data is in.
export function useRoomAccess(
  roomId: string,
  hooks: {
    // Right after the HTTP join succeeded, before the socket.
    onJoined?: (room: RoomDto) => void;
    // After the socket joined and chat history loaded; `entered` waits for it.
    afterSocket: () => Promise<void>;
  },
) {
  const auth = useAuthStore();
  const player = usePlayerStore();
  const chat = useChatStore();

  const entering = ref(false);
  // True once the socket has joined the room and the first data is in. Before that the room UI must not
  // be usable: a chat message typed in that gap would go nowhere and vanish without a trace.
  const entered = ref(false);
  const enterError = ref<string | null>(null);
  const notFound = ref(false);
  const requiresPassword = ref(false);
  const passwordPrompt = ref(false);
  const passwordError = ref<string | null>(null);
  const roomInfo = ref<RoomDto | null>(null);
  const roomOwnerId = ref<string | null>(null);

  // Everything that requires a session. Separate from start() so the guest prompt can call it
  // again after the guest signs in, without a page reload.
  async function enterRoom(password?: string) {
    entering.value = true;
    enterError.value = null;
    try {
      const joined = await roomsApi.join(roomId, password);
      roomOwnerId.value = joined.room.ownerId;
      roomInfo.value = joined.room;
      hooks.onJoined?.(joined.room);
      passwordPrompt.value = false;
      await player.enterRoom(roomId);
      await chat.enterRoom(roomId);
      await hooks.afterSocket();
      entered.value = true;
    } catch (err) {
      if (err instanceof ApiError && (err.message === "PASSWORD_REQUIRED" || err.message === "WRONG_PASSWORD")) {
        passwordPrompt.value = true;
        passwordError.value = err.message === "WRONG_PASSWORD" ? humanize(err.message) : null;
      } else if (err instanceof ApiError && err.status === 404) {
        notFound.value = true;
      } else if (err instanceof ApiError && /no longer active/i.test(err.message)) {
        enterError.value = "Эта комната закрыта хозяином или удалена за неактивность. Попросите новую ссылку.";
      } else if (err instanceof ApiError && err.status === 429) {
        enterError.value = "Слишком много попыток. Подождите минуту и обновите страницу.";
      } else {
        enterError.value = "Не удалось войти в комнату. Обновите страницу или попросите новую ссылку.";
      }
    } finally {
      entering.value = false;
    }
  }

  async function submitPassword(password: string) {
    await enterRoom(password);
  }

  async function handleGuestJoin(displayName: string, password: string) {
    entering.value = true;
    try {
      await auth.joinAsGuest(roomId, displayName, password);
      await enterRoom();
    } catch {
      // auth.error already carries the message; the prompt renders it.
    } finally {
      entering.value = false;
    }
  }

  // On mount: does the room exist, does it want a password, and — with a session — go in.
  async function start() {
    try {
      const { room } = await roomsApi.preview(roomId);
      requiresPassword.value = room.requiresPassword;
    } catch {
      notFound.value = true;
      return;
    }
    if (auth.isAuthenticated) return enterRoom();
  }

  return {
    entering,
    entered,
    enterError,
    notFound,
    requiresPassword,
    passwordPrompt,
    passwordError,
    roomInfo,
    roomOwnerId,
    start,
    submitPassword,
    handleGuestJoin,
  };
}
