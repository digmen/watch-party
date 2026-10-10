<script setup lang="ts">
import type { PresenceMember } from "@watch-party/shared";
import { computed } from "vue";

const props = defineProps<{
  name: string;
  visibility: "public" | "private";
  hasPassword: boolean;
  members: PresenceMember[];
  canManage: boolean;
  isOwner: boolean;
  copied: boolean;
  backLabel: string;
}>();
const emit = defineEmits<{ back: []; copy: []; changeVideo: []; settings: [] }>();

const PALETTE = ["#ff8a65", "#ffd54f", "#81c784", "#4dd0e1", "#7986cb", "#ba68c8", "#f06292", "#a1887f"];
function colorFor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}
const shown = computed(() => props.members.slice(0, 5));
const extra = computed(() => Math.max(0, props.members.length - shown.value.length));
const badge = computed(() => {
  if (props.hasPassword) return "🔒 Пароль";
  return props.visibility === "public" ? "🌐 Публичная" : "🔗 По ссылке";
});
</script>

<template>
  <header class="bar">
    <button class="quiet back" :aria-label="backLabel" @click="emit('back')">←</button>

    <div class="who">
      <h1 class="name">{{ name || "Комната" }}</h1>
      <span class="badge">{{ badge }}</span>
    </div>

    <div class="people" :title="members.map((m) => m.displayName).join(', ')">
      <span
        v-for="m in shown"
        :key="m.userId"
        class="av"
        :style="{ background: colorFor(m.userId) }"
        :aria-label="m.displayName"
        >{{ (m.displayName.trim()[0] ?? "?").toUpperCase() }}</span
      >
      <span v-if="extra > 0" class="av more">+{{ extra }}</span>
      <span class="count">{{ members.length }} в комнате</span>
    </div>

    <div class="actions">
      <button v-if="canManage" class="ghost" @click="emit('changeVideo')">Сменить видео</button>
      <button v-if="isOwner" class="ghost icon" aria-label="Настройки комнаты" @click="emit('settings')">⚙</button>
      <button data-testid="copy-link" class="invite" @click="emit('copy')">{{ copied ? "✓ Скопировано" : "Пригласить" }}</button>
    </div>
  </header>
</template>

<style scoped>
.bar {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-4);
  border-bottom: 1px solid var(--color-border);
  background: var(--color-surface);
  min-height: 3.4rem;
}
.back {
  font-size: 1.2rem;
  padding: var(--space-2) var(--space-3);
}
.who {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-width: 0;
  flex: 1;
}
.name {
  font-size: var(--text-base);
  font-weight: 650;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.badge {
  flex: none;
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-full);
  padding: 0.1rem 0.6rem;
}
.people {
  display: flex;
  align-items: center;
}
.av {
  width: 1.9rem;
  height: 1.9rem;
  margin-left: -6px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  border: 2px solid var(--color-surface);
  font-size: var(--text-xs);
  font-weight: 700;
  color: #14181f;
}
.av:first-child {
  margin-left: 0;
}
.av.more {
  background: var(--color-surface-raised);
  color: var(--color-text);
}
.count {
  margin-left: var(--space-3);
  font-size: var(--text-xs);
  color: var(--color-text-muted);
}
.actions {
  display: flex;
  gap: var(--space-2);
  align-items: center;
}
.actions button {
  padding: var(--space-2) var(--space-4);
  font-size: var(--text-sm);
  white-space: nowrap;
}
.actions .icon {
  padding: var(--space-2) var(--space-3);
}
@media (max-width: 56rem) {
  .count,
  .badge {
    display: none;
  }
}
@media (max-width: 40rem) {
  .bar {
    padding: var(--space-2) var(--space-3);
    gap: var(--space-2);
  }
  .people {
    display: none;
  }
  .actions button {
    padding: var(--space-2) var(--space-3);
  }
}
@media (max-width: 26rem) {
  .actions .ghost:not(.icon) {
    display: none;
  }
}
</style>
