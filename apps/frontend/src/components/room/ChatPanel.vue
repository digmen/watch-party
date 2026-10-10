<script setup lang="ts">
import type { ChatMessageDto } from "@watch-party/shared";
import { computed, nextTick, ref, watch } from "vue";

export interface ChatNotice {
  id: string;
  system: true;
  body: string;
  createdAt: string;
}

const props = defineProps<{
  messages: ChatMessageDto[];
  notices: ChatNotice[];
  selfId: string | null;
  alone: boolean;
  inviteCopied: boolean;
}>();
const emit = defineEmits<{ send: [text: string]; invite: [] }>();

const text = ref("");
const log = ref<HTMLElement | null>(null);
const pinnedToBottom = ref(true);
const unread = ref(0);

type Row = (ChatMessageDto & { system?: false; mine: boolean; showName: boolean }) | ChatNotice;

// One timeline: persisted messages plus local "X зашёл" notices, oldest first. Consecutive
// messages from one person only repeat the name when someone else spoke in between.
const rows = computed<Row[]>(() => {
  const merged = [...props.messages, ...props.notices].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  let lastAuthor: string | null = null;
  return merged.map((m): Row => {
    if ("system" in m) {
      lastAuthor = null;
      return m;
    }
    const showName = lastAuthor !== m.userId;
    lastAuthor = m.userId;
    return { ...m, mine: m.userId === props.selfId, showName };
  });
});

const PALETTE = ["#ff8a65", "#ffd54f", "#81c784", "#4dd0e1", "#7986cb", "#ba68c8", "#f06292", "#a1887f"];
function colorFor(userId: string): string {
  let h = 0;
  for (let i = 0; i < userId.length; i++) h = (h * 31 + userId.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}
function initial(name: string): string {
  return (name.trim()[0] ?? "?").toUpperCase();
}
function hhmm(iso: string): string {
  return new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

function onScroll() {
  const el = log.value;
  if (!el) return;
  pinnedToBottom.value = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
  if (pinnedToBottom.value) unread.value = 0;
}

function toBottom() {
  const el = log.value;
  if (!el) return;
  el.scrollTop = el.scrollHeight;
  pinnedToBottom.value = true;
  unread.value = 0;
}

// Follow new messages only when the reader is already at the bottom; otherwise show a jump button
// instead of yanking the history they are reading.
watch(
  () => rows.value.length,
  async (now, before) => {
    await nextTick();
    if (pinnedToBottom.value) toBottom();
    else unread.value += Math.max(0, now - before);
  },
);

function submit() {
  const v = text.value.trim();
  if (!v) return;
  emit("send", v);
  text.value = "";
  nextTick(toBottom);
}
</script>

<template>
  <section class="chat" aria-label="Чат комнаты">
    <header class="chat-head">
      <h2>Чат</h2>
    </header>

    <div ref="log" class="log" data-testid="chat-log" @scroll="onScroll">
      <div v-if="rows.length === 0" class="empty">
        <p v-if="alone">Вы пока один. Отправьте ссылку друзьям — им достаточно ввести имя.</p>
        <p v-else>Пока тихо. Напишите первым.</p>
        <button v-if="alone" class="ghost invite" @click="emit('invite')">
          {{ inviteCopied ? "Ссылка скопирована" : "Скопировать ссылку" }}
        </button>
      </div>

      <template v-for="r in rows" :key="r.id">
        <p v-if="'system' in r" class="notice">{{ r.body }}</p>
        <div v-else class="msg" :class="{ mine: r.mine }">
          <span v-if="!r.mine" class="avatar" :style="{ background: colorFor(r.userId) }" :class="{ ghosted: !r.showName }">
            {{ r.showName ? initial(r.displayName) : "" }}
          </span>
          <div class="bubble">
            <span v-if="!r.mine && r.showName" class="author" :style="{ color: colorFor(r.userId) }">{{ r.displayName }}</span>
            <span class="body">{{ r.body }}</span>
            <time class="time">{{ hhmm(r.createdAt) }}</time>
          </div>
        </div>
      </template>
    </div>

    <button v-if="unread > 0" class="jump" @click="toBottom">↓ Новые сообщения · {{ unread }}</button>

    <form class="composer" @submit.prevent="submit">
      <input
        v-model="text"
        data-testid="chat-input"
        type="text"
        maxlength="2000"
        placeholder="Написать сообщение…"
        aria-label="Сообщение"
        enterkeyhint="send"
        autocomplete="off"
      />
      <button type="submit" data-testid="chat-send" class="send" :disabled="!text.trim()" aria-label="Отправить">➤</button>
    </form>
  </section>
</template>

<style scoped>
.chat {
  position: relative;
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
  background: var(--color-surface);
  border-left: 1px solid var(--color-border);
}
.chat-head {
  padding: var(--space-3) var(--space-4);
  border-bottom: 1px solid var(--color-border);
}
.chat-head h2 {
  font-size: var(--text-sm);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--color-text-faint);
}
.log {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: var(--space-3) var(--space-4);
  display: flex;
  flex-direction: column;
  gap: 2px;
  overscroll-behavior: contain;
}
.empty {
  margin: auto;
  text-align: center;
  color: var(--color-text-faint);
  font-size: var(--text-sm);
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  align-items: center;
  padding: var(--space-4);
}
.notice {
  text-align: center;
  color: var(--color-text-faint);
  font-size: var(--text-xs);
  padding: var(--space-2) 0;
}
.msg {
  display: flex;
  gap: var(--space-2);
  align-items: flex-end;
  max-width: 92%;
  margin-top: 2px;
}
.msg.mine {
  align-self: flex-end;
  flex-direction: row-reverse;
}
.avatar {
  flex: none;
  width: 1.7rem;
  height: 1.7rem;
  border-radius: 50%;
  display: grid;
  place-items: center;
  font-size: var(--text-xs);
  font-weight: 700;
  color: #14181f;
}
.avatar.ghosted {
  background: transparent !important;
}
.bubble {
  background: var(--color-surface-raised);
  border-radius: 14px;
  padding: 0.4rem 0.7rem 0.3rem;
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0 var(--space-2);
  min-width: 0;
}
.mine .bubble {
  background: rgb(255 107 90 / 0.22);
}
.author {
  width: 100%;
  font-size: var(--text-xs);
  font-weight: 650;
}
.body {
  font-size: var(--text-sm);
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}
.time {
  margin-left: auto;
  color: var(--color-text-faint);
  font-size: 0.65rem;
}
.jump {
  position: absolute;
  left: 50%;
  bottom: 4.2rem;
  transform: translateX(-50%);
  padding: var(--space-1) var(--space-4);
  border-radius: var(--radius-full);
  font-size: var(--text-xs);
  box-shadow: var(--shadow);
}
.composer {
  display: flex;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-3) max(var(--space-3), env(safe-area-inset-bottom));
  border-top: 1px solid var(--color-border);
  background: var(--color-surface);
}
.composer input {
  flex: 1;
  min-width: 0;
  border-radius: var(--radius-full);
  padding: var(--space-3) var(--space-4);
  /* 16px: anything smaller makes iOS Safari zoom the page when the field is focused. */
  font-size: 16px;
}
.send {
  flex: none;
  width: 2.8rem;
  padding: 0;
  border-radius: 50%;
}
</style>
