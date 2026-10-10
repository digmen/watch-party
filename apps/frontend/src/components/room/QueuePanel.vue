<script setup lang="ts">
import type { QueueItemDto } from "@watch-party/shared";
import { computed, ref } from "vue";

const props = defineProps<{
  items: QueueItemDto[];
  canAdd: boolean;
  isOwner: boolean;
  selfId: string | null;
  busy: boolean;
  error: string | null;
}>();
const emit = defineEmits<{
  add: [url: string];
  play: [id: string];
  remove: [id: string];
  reorder: [order: string[]];
  next: [];
}>();

const url = ref("");
const input = ref<HTMLInputElement | null>(null);
const dragId = ref<string | null>(null);

const current = computed(() => props.items.find((i) => i.status === "playing") ?? null);
const queued = computed(() => props.items.filter((i) => i.status === "queued"));

function label(item: QueueItemDto): string {
  if (item.title) return item.title;
  try {
    return new URL(item.sourceUrl).hostname.replace(/^www\./, "");
  } catch {
    return "Видео";
  }
}

function submit() {
  const v = url.value.trim();
  if (!v) return;
  emit("add", v);
  url.value = "";
}

function move(id: string, delta: -1 | 1) {
  const order = queued.value.map((i) => i.id);
  const from = order.indexOf(id);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= order.length) return;
  order.splice(to, 0, order.splice(from, 1)[0]);
  emit("reorder", order);
}

function onDrop(targetId: string) {
  const from = dragId.value;
  dragId.value = null;
  if (!from || from === targetId) return;
  const order = queued.value.map((i) => i.id);
  order.splice(order.indexOf(targetId), 0, order.splice(order.indexOf(from), 1)[0]);
  emit("reorder", order);
}

function canRemove(item: QueueItemDto): boolean {
  return item.status === "queued" && (props.isOwner || item.addedById === props.selfId);
}

defineExpose({ focusInput: () => input.value?.focus() });
</script>

<template>
  <section class="queue" aria-label="Очередь видео">
    <header class="head">
      <h2>Очередь <span class="count">{{ queued.length }}</span></h2>
      <button v-if="isOwner && queued.length > 0" class="ghost small" data-testid="queue-next" @click="emit('next')">
        Следующее ▶▶
      </button>
    </header>

    <form v-if="canAdd" class="add" @submit.prevent="submit">
      <input
        ref="input"
        v-model="url"
        data-testid="queue-add-input"
        type="url"
        required
        placeholder="Добавить в очередь: ссылка на видео"
        aria-label="Ссылка на видео для очереди"
        autocomplete="off"
      />
      <button type="submit" data-testid="queue-add-submit" :disabled="busy || !url.trim()">
        {{ busy ? "…" : "Добавить" }}
      </button>
    </form>
    <p v-else class="hint">В этой комнате видео добавляет только хозяин.</p>
    <p v-if="error" class="error" role="alert">{{ error }}</p>

    <ul class="list" data-testid="queue-list">
      <li v-if="current" class="item now" data-testid="queue-item" data-status="playing" :data-title="label(current)">
        <span class="badge">Сейчас</span>
        <span class="title">{{ label(current) }}</span>
        <span class="by">{{ current.addedByName }}</span>
      </li>

      <li
        v-for="(item, index) in queued"
        :key="item.id"
        class="item"
        :class="{ dragging: dragId === item.id }"
        data-testid="queue-item"
        data-status="queued"
        :data-title="label(item)"
        :draggable="isOwner"
        @dragstart="dragId = item.id"
        @dragover.prevent
        @drop.prevent="onDrop(item.id)"
        @dragend="dragId = null"
      >
        <span class="badge muted">{{ index + 1 }}</span>
        <span class="title">{{ label(item) }}</span>
        <span v-if="item.assetStatus === 'pending' || item.assetStatus === 'processing'" class="state" title="Готовится">
          <span class="spinner" aria-hidden="true"></span>
        </span>
        <span v-else-if="item.assetStatus === 'failed'" class="state bad" title="Не получилось подготовить">⚠</span>
        <span class="by">{{ item.addedByName }}</span>
        <span class="actions">
          <button
            v-if="isOwner"
            class="icon"
            data-testid="queue-play"
            aria-label="Включить сейчас"
            title="Включить сейчас"
            @click="emit('play', item.id)"
          >
            ▶
          </button>
          <button v-if="isOwner && index > 0" class="icon" aria-label="Выше" @click="move(item.id, -1)">↑</button>
          <button v-if="isOwner && index < queued.length - 1" class="icon" aria-label="Ниже" @click="move(item.id, 1)">↓</button>
          <button v-if="canRemove(item)" class="icon" data-testid="queue-remove" aria-label="Убрать из очереди" @click="emit('remove', item.id)">✕</button>
        </span>
      </li>

      <li v-if="queued.length === 0 && current" class="empty">Очередь пуста — добавьте следующее видео, оно включится само.</li>
    </ul>
  </section>
</template>

<style scoped>
.queue {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
}
.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
h2 {
  font-size: var(--text-sm);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--color-text-faint);
}
.count {
  margin-left: var(--space-2);
  color: var(--color-text-muted);
}
.small {
  padding: var(--space-1) var(--space-3);
  font-size: var(--text-xs);
}
.add {
  display: flex;
  gap: var(--space-2);
}
.add input {
  flex: 1;
  min-width: 0;
  font-size: 16px;
}
.hint {
  color: var(--color-text-faint);
  font-size: var(--text-sm);
}
.list {
  list-style: none;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
.item {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius);
  background: var(--color-surface-raised);
  min-width: 0;
}
.item[draggable="true"] {
  cursor: grab;
}
.item.dragging {
  opacity: 0.4;
}
.item.now {
  background: rgb(255 107 90 / 0.14);
}
.badge {
  flex: none;
  font-size: var(--text-xs);
  font-weight: 700;
  color: var(--color-accent);
}
.badge.muted {
  color: var(--color-text-faint);
  min-width: 1rem;
  text-align: center;
}
.title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--text-sm);
}
.by {
  flex: none;
  max-width: 7rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--color-text-faint);
  font-size: var(--text-xs);
}
.state.bad {
  color: var(--color-danger);
}
.spinner {
  display: inline-block;
  width: 0.9rem;
  height: 0.9rem;
  border: 2px solid var(--color-border-strong);
  border-top-color: var(--color-accent);
  border-radius: 50%;
  animation: spin 700ms linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
.actions {
  display: flex;
  gap: 2px;
  flex: none;
}
.icon {
  background: transparent;
  color: var(--color-text-muted);
  padding: var(--space-1) var(--space-2);
  min-width: 1.8rem;
  font-size: var(--text-sm);
}
.icon:hover:not(:disabled) {
  background: var(--color-surface);
  color: var(--color-text);
}
.empty {
  color: var(--color-text-faint);
  font-size: var(--text-sm);
  padding: var(--space-2) var(--space-1);
}
@media (max-width: 40rem) {
  .by {
    display: none;
  }
}
</style>
