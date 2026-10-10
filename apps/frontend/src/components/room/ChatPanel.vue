<script setup lang="ts">
import type { ChatMessageDto } from "@watch-party/shared";
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";

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
  typingNames: string[];
}>();
const emit = defineEmits<{ send: [text: string, replyToId?: string]; invite: []; typing: [] }>();

const text = ref("");
const log = ref<HTMLElement | null>(null);
const input = ref<HTMLInputElement | null>(null);
const pinnedToBottom = ref(true);
const unread = ref(0);
const replyTo = ref<ChatMessageDto | null>(null);
const flashId = ref<string | null>(null);

type Row = (ChatMessageDto & { system?: false; mine: boolean }) | ChatNotice;

// One timeline: persisted messages plus local "X зашёл" notices, oldest first.
const rows = computed<Row[]>(() => {
  const merged = [...props.messages, ...props.notices].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return merged.map((m): Row => {
    if ("system" in m) return m;
    return { ...m, mine: m.userId === props.selfId };
  });
});

const typingLabel = computed(() => {
  const names = props.typingNames;
  if (names.length === 0) return "";
  if (names.length === 1) return `${names[0]} печатает…`;
  if (names.length === 2) return `${names[0]} и ${names[1]} печатают…`;
  return "Несколько человек печатают…";
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

function startReply(message: ChatMessageDto) {
  replyTo.value = message;
  input.value?.focus();
}

// Clicking a quote scrolls to the original and flashes it.
function jumpTo(id: string) {
  const el = log.value?.querySelector<HTMLElement>(`[data-message-id="${id}"]`);
  if (!el) return;
  el.scrollIntoView({ block: "center", behavior: "smooth" });
  flashId.value = id;
  setTimeout(() => {
    if (flashId.value === id) flashId.value = null;
  }, 1600);
}

// Phones have no hover: a long press on a message starts a reply.
let pressTimer: ReturnType<typeof setTimeout> | null = null;
function pressStart(message: ChatMessageDto) {
  pressTimer = setTimeout(() => startReply(message), 450);
}
function pressEnd() {
  if (pressTimer) clearTimeout(pressTimer);
  pressTimer = null;
}
onBeforeUnmount(pressEnd);

function submit() {
  const v = text.value.trim();
  if (!v) return;
  emit("send", v, replyTo.value?.id);
  text.value = "";
  replyTo.value = null;
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
        <div
          v-else
          class="msg"
          :class="{ mine: r.mine, flash: flashId === r.id }"
          :data-message-id="r.id"
          data-testid="chat-message"
          @pointerdown="pressStart(r)"
          @pointerup="pressEnd"
          @pointerleave="pressEnd"
          @pointercancel="pressEnd"
        >
          <span v-if="!r.mine" class="avatar" :style="{ background: colorFor(r.userId) }">{{ initial(r.displayName) }}</span>
          <div class="bubble">
            <span class="author" data-testid="chat-author" :style="{ color: r.mine ? undefined : colorFor(r.userId) }">
              {{ r.mine ? "Вы" : r.displayName }}
            </span>
            <button
              v-if="r.replyTo"
              type="button"
              class="quote"
              data-testid="chat-quote"
              @click="jumpTo(r.replyTo.id)"
            >
              <b>{{ r.replyTo.displayName }}</b> {{ r.replyTo.snippet }}
            </button>
            <span class="body">{{ r.body }}</span>
            <time class="time">{{ hhmm(r.createdAt) }}</time>
            <button type="button" class="reply-btn" data-testid="chat-reply" aria-label="Ответить" title="Ответить" @click="startReply(r)">↩</button>
          </div>
        </div>
      </template>
    </div>

    <button v-if="unread > 0" class="jump" @click="toBottom">↓ Новые сообщения · {{ unread }}</button>

    <p v-if="typingLabel" class="typing" data-testid="chat-typing" role="status">{{ typingLabel }}</p>

    <div v-if="replyTo" class="replying" data-testid="chat-replying">
      <span class="replying-text"><b>{{ replyTo.userId === selfId ? "Вы" : replyTo.displayName }}</b> {{ replyTo.body }}</span>
      <button type="button" class="icon" aria-label="Отменить ответ" @click="replyTo = null">✕</button>
    </div>

    <form class="composer" @submit.prevent="submit">
      <input
        ref="input"
        v-model="text"
        data-testid="chat-input"
        type="text"
        maxlength="2000"
        placeholder="Написать сообщение…"
        aria-label="Сообщение"
        enterkeyhint="send"
        autocomplete="off"
        @input="emit('typing')"
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
  gap: var(--space-2);
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
  padding: var(--space-1) 0;
}
.msg {
  display: flex;
  gap: var(--space-2);
  align-items: flex-end;
  max-width: 94%;
  border-radius: var(--radius);
  transition: background 300ms;
}
.msg.mine {
  align-self: flex-end;
  flex-direction: row-reverse;
}
.msg.flash {
  background: rgb(255 255 255 / 0.1);
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
.bubble {
  position: relative;
  background: var(--color-surface-raised);
  border-radius: 14px;
  padding: 0.35rem 0.7rem 0.3rem;
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
  color: var(--color-text-muted);
}
.quote {
  width: 100%;
  margin: 2px 0 4px;
  padding: 0.2rem 0.5rem;
  text-align: left;
  font-size: var(--text-xs);
  font-weight: 400;
  color: var(--color-text-muted);
  background: rgb(255 255 255 / 0.06);
  border: none;
  border-left: 3px solid var(--color-accent);
  border-radius: 6px;
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.quote:hover:not(:disabled) {
  background: rgb(255 255 255 / 0.1);
  transform: none;
}
.quote b {
  color: var(--color-text);
  margin-right: 0.3rem;
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
/* Appears on hover (desktop); on touch screens a long press does the same job. */
.reply-btn {
  position: absolute;
  top: -0.7rem;
  right: 0.3rem;
  padding: 0.05rem 0.45rem;
  font-size: var(--text-xs);
  border-radius: var(--radius-full);
  background: var(--color-surface);
  color: var(--color-text);
  border: 1px solid var(--color-border-strong);
  opacity: 0;
  pointer-events: none;
  transition: opacity 120ms;
}
.msg:hover .reply-btn,
.reply-btn:focus-visible {
  opacity: 1;
  pointer-events: auto;
}
.jump {
  position: absolute;
  left: 50%;
  bottom: 5.4rem;
  transform: translateX(-50%);
  padding: var(--space-1) var(--space-4);
  border-radius: var(--radius-full);
  font-size: var(--text-xs);
  box-shadow: var(--shadow);
}
.typing {
  padding: 0 var(--space-4) var(--space-1);
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  min-height: 1.2rem;
}
.replying {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin: 0 var(--space-3);
  padding: var(--space-1) var(--space-3);
  background: var(--color-surface-raised);
  border-left: 3px solid var(--color-accent);
  border-radius: 6px;
  font-size: var(--text-xs);
}
.replying-text {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--color-text-muted);
}
.replying-text b {
  color: var(--color-text);
  margin-right: 0.3rem;
}
.icon {
  background: transparent;
  color: var(--color-text-muted);
  padding: 0 var(--space-2);
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
