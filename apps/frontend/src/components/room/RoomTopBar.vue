<script setup lang="ts">
import type { PresenceMember } from "@watch-party/shared";
import { computed } from "vue";
import BrandMark from "../ui/BrandMark.vue";

const props = defineProps<{
  name: string;
  visibility: "public" | "private";
  hasPassword: boolean;
  members: PresenceMember[];
  canManage: boolean;
  isOwner: boolean;
  copied: boolean;
  backLabel: string;
  // The settings panel is open (desktop): the gear shows as pressed.
  settingsActive?: boolean;
}>();
const emit = defineEmits<{ back: []; copy: []; addVideo: []; settings: [] }>();

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
    <button class="quiet icon back" :aria-label="backLabel" :title="backLabel" @click="emit('back')">
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
        <path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </button>
    <BrandMark class="mark" :size="28" />

    <div class="who">
      <h1 class="name" :title="name || 'Комната'">{{ name || "Комната" }}</h1>
      <p class="meta">
        <span class="badge">{{ badge }}</span>
        <span class="count">{{ members.length }} в комнате</span>
      </p>
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
    </div>

    <div class="actions">
      <button v-if="canManage" class="ghost add" data-testid="add-video-open" @click="emit('addVideo')">
        <span aria-hidden="true">+</span> Добавить видео
      </button>
      <button
        v-if="isOwner"
        class="ghost icon gear"
        aria-label="Настройки комнаты"
        title="Настройки комнаты"
        :aria-pressed="settingsActive ?? false"
        @click="emit('settings')"
      >
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
          <path
            d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm7.4-2.1.1-1.4-.1-1.4 2-1.6-2-3.4-2.4 1a7.6 7.6 0 0 0-2.4-1.4L14.2 2h-4.4l-.4 2.6c-.9.3-1.7.8-2.4 1.4l-2.4-1-2 3.4 2 1.6-.1 1.4.1 1.4-2 1.6 2 3.4 2.4-1c.7.6 1.5 1.1 2.4 1.4l.4 2.6h4.4l.4-2.6c.9-.3 1.7-.8 2.4-1.4l2.4 1 2-3.4-2-1.6Z"
            fill="none"
            stroke="currentColor"
            stroke-width="1.6"
            stroke-linejoin="round"
          />
        </svg>
      </button>
      <button
        data-testid="copy-link"
        class="invite"
        :class="{ done: copied }"
        :aria-label="copied ? 'Ссылка скопирована' : 'Пригласить: скопировать ссылку на комнату'"
        @click="emit('copy')"
      >
        <svg v-if="!copied" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path
            d="M10 14a4.5 4.5 0 0 0 6.4 0l3.2-3.2a4.5 4.5 0 0 0-6.4-6.4L12 5.6M14 10a4.5 4.5 0 0 0-6.4 0l-3.2 3.2a4.5 4.5 0 0 0 6.4 6.4l1.2-1.2"
            fill="none"
            stroke="currentColor"
            stroke-width="2.2"
            stroke-linecap="round"
          />
        </svg>
        <svg v-else viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        <span class="invite-label">{{ copied ? "Скопировано" : "Пригласить" }}</span>
      </button>
    </div>

    <p v-if="copied" class="toast" role="status">Ссылка скопирована — отправьте её друзьям</p>
  </header>
</template>

<style scoped>
.bar {
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-4);
  padding-top: max(var(--space-2), env(safe-area-inset-top));
  padding-inline: max(var(--space-4), env(safe-area-inset-left)) max(var(--space-4), env(safe-area-inset-right));
  border-bottom: 1px solid var(--color-border);
  background: rgb(17 17 22 / 0.92);
  min-height: 3.75rem;
  z-index: 10;
}
.icon {
  width: 2.75rem;
  min-height: 2.75rem;
  flex: none;
}
.back {
  color: var(--color-text);
  margin-left: calc(-1 * var(--space-2));
}
.mark {
  flex: none;
}
.who {
  min-width: 0;
  flex: 1;
  line-height: 1.25;
}
.name {
  font-size: var(--text-base);
  font-weight: 600;
  letter-spacing: -0.01em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.meta {
  display: flex;
  gap: var(--space-2);
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  white-space: nowrap;
  overflow: hidden;
}
.count::before {
  content: "·";
  margin-right: var(--space-2);
  color: var(--color-text-faint);
}
.people {
  display: flex;
  align-items: center;
}
.av {
  width: 2rem;
  height: 2rem;
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
.actions {
  display: flex;
  gap: var(--space-2);
  align-items: center;
  flex: none;
}
.add {
  min-height: 2.75rem;
  padding: var(--space-2) var(--space-4);
  font-size: var(--text-sm);
}
.gear[aria-pressed="true"] {
  border-color: var(--color-accent-line);
  color: var(--color-accent);
}
.invite {
  min-height: 2.75rem;
  padding: var(--space-2) var(--space-4);
  font-size: var(--text-sm);
}
.invite.done {
  background: var(--color-success-soft);
  color: var(--color-success);
  border-color: rgb(74 222 128 / 0.35);
}
.toast {
  position: absolute;
  top: calc(100% + var(--space-2));
  right: var(--space-3);
  padding: var(--space-2) var(--space-4);
  border-radius: var(--radius-full);
  background: var(--color-surface-raised);
  border: 1px solid var(--color-border-strong);
  box-shadow: var(--shadow);
  font-size: var(--text-sm);
  white-space: nowrap;
  max-width: calc(100vw - 2 * var(--space-3));
  overflow: hidden;
  text-overflow: ellipsis;
  animation: toast-in 160ms ease-out;
  pointer-events: none;
}
@keyframes toast-in {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
}
/* On the desktop the invite button says it in words; the toast is for the icon-only phone button. */
@media (min-width: 56rem) {
  .toast {
    display: none;
  }
}

/* Phone/tablet: room settings live in the tab bar, the queue too. The bar keeps back, name, invite. */
@media (max-width: 55.99rem) {
  .people,
  .gear,
  .add {
    display: none;
  }
}
@media (max-width: 40rem) {
  .bar {
    gap: var(--space-2);
    min-height: 3.5rem;
    padding-block: var(--space-1);
    padding-top: max(var(--space-1), env(safe-area-inset-top));
    padding-inline: max(var(--space-3), env(safe-area-inset-left)) max(var(--space-3), env(safe-area-inset-right));
  }
  .badge {
    display: none;
  }
  .count::before {
    content: none;
  }
  .invite {
    width: 2.75rem;
    padding: 0;
    border-radius: var(--radius);
  }
  .invite-label {
    display: none;
  }
}
/* Phone landscape: every pixel of height goes to the picture. */
@media (max-width: 55.99rem) and (orientation: landscape) and (max-height: 32rem) {
  .bar {
    min-height: 3rem;
    padding-block: 0;
  }
}
</style>
