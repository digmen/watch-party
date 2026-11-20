import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import type { ChatNotice } from "../components/room/ChatPanel.vue";
import { useAuthStore } from "../stores/auth.store";
import { useChatStore } from "../stores/chat.store";
import { usePlayerStore } from "../stores/player.store";

// Who is around: "X зашёл / вышел" notices for the chat, the "X печатает…" names, and "alone".
export function useRoomPresence() {
  const player = usePlayerStore();
  const auth = useAuthStore();
  const chat = useChatStore();

  const notices = ref<ChatNotice[]>([]);
  const alone = computed(() => player.members.length <= 1);

  // People who typed within the last few seconds. `clock` ticks once a second so the label fades by itself.
  const clock = ref(Date.now());
  const typingNames = computed(() =>
    Object.entries(chat.typing)
      .filter(([userId, t]) => userId !== auth.user?.id && clock.value - t.at < 4000)
      .map(([, t]) => t.name),
  );
  let clockTimer: ReturnType<typeof setInterval> | null = null;

  function pushNotice(body: string) {
    notices.value = [
      ...notices.value.slice(-20),
      { id: crypto.randomUUID(), system: true, body, createdAt: new Date().toISOString() },
    ];
  }

  // "Друг зашёл / вышел" — local notices derived from presence, not stored messages.
  let knownMembers = new Map<string, string>();
  watch(
    () => player.members,
    (members) => {
      const next = new Map(members.map((m) => [m.userId, m.displayName]));
      if (knownMembers.size > 0) {
        for (const [id, name] of next) {
          if (!knownMembers.has(id) && id !== auth.user?.id) pushNotice(`${name} зашёл(а) в комнату`);
        }
        for (const [id, name] of knownMembers) {
          if (!next.has(id)) pushNotice(`${name} вышел(а)`);
        }
      }
      knownMembers = next;
    },
    { deep: true },
  );

  onMounted(() => {
    clockTimer = setInterval(() => {
      clock.value = Date.now();
    }, 1000);
  });
  onUnmounted(() => {
    if (clockTimer) clearInterval(clockTimer);
  });

  return { notices, alone, typingNames };
}
