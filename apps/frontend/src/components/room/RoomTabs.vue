<script setup lang="ts">
export interface RoomTab {
  id: string;
  label: string;
  badge?: number;
}

const props = defineProps<{ tabs: RoomTab[]; modelValue: string; idPrefix: string }>();
const emit = defineEmits<{ "update:modelValue": [id: string] }>();

// Arrow keys move between tabs, as the ARIA tabs pattern expects.
function onKeydown(event: KeyboardEvent, index: number) {
  const delta = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
  if (!delta) return;
  event.preventDefault();
  const next = props.tabs[(index + delta + props.tabs.length) % props.tabs.length];
  emit("update:modelValue", next.id);
  document.getElementById(`${props.idPrefix}-tab-${next.id}`)?.focus();
}
</script>

<template>
  <div class="tabs" role="tablist" aria-label="Панели комнаты">
    <button
      v-for="(tab, index) in tabs"
      :id="`${idPrefix}-tab-${tab.id}`"
      :key="tab.id"
      type="button"
      role="tab"
      class="tab"
      :data-testid="`room-tab-${tab.id}`"
      :aria-selected="modelValue === tab.id"
      :aria-controls="`${idPrefix}-panel-${tab.id}`"
      :tabindex="modelValue === tab.id ? 0 : -1"
      @click="emit('update:modelValue', tab.id)"
      @keydown="onKeydown($event, index)"
    >
      {{ tab.label }}
      <span v-if="tab.badge" class="badge" :aria-label="`непрочитанных: ${tab.badge}`">{{ tab.badge > 99 ? "99+" : tab.badge }}</span>
    </button>
  </div>
</template>

<style scoped>
.tabs {
  display: flex;
  gap: var(--space-1);
  padding: var(--space-1) var(--space-2);
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
}
.tab {
  position: relative;
  flex: 1;
  min-height: 2.75rem;
  padding: var(--space-2) var(--space-3);
  background: transparent;
  color: var(--color-text-muted);
  border: none;
  border-radius: var(--radius);
  font-size: var(--text-sm);
  font-weight: 700;
}
.tab:hover:not(:disabled) {
  background: var(--color-surface-raised);
  color: var(--color-text);
  box-shadow: none;
}
.tab[aria-selected="true"] {
  color: var(--color-text);
  background: var(--color-surface-raised);
}
.tab[aria-selected="true"]::after {
  content: "";
  position: absolute;
  left: 30%;
  right: 30%;
  bottom: 3px;
  height: 2px;
  border-radius: 2px;
  background: var(--color-accent);
}
.badge {
  min-width: 1.25rem;
  height: 1.25rem;
  padding: 0 5px;
  border-radius: var(--radius-full);
  background: var(--color-accent);
  color: var(--color-accent-contrast);
  font-size: 0.7rem;
  font-weight: 800;
  line-height: 1.25rem;
}
</style>
