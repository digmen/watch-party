<script setup lang="ts">
defineProps<{ items: { q: string; a: string }[] }>();
</script>

<template>
  <div class="faq-list">
    <details v-for="f in items" :key="f.q" class="faq">
      <summary>
        <span>{{ f.q }}</span>
        <span class="sign" aria-hidden="true"></span>
      </summary>
      <p>{{ f.a }}</p>
    </details>
  </div>
</template>

<style scoped>
.faq-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
.faq {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  transition:
    border-color var(--transition),
    background var(--transition);
}
.faq[open] {
  border-color: var(--color-accent-line);
  background: var(--color-surface-raised);
}
summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  min-height: 3.5rem;
  padding: var(--space-3) var(--space-5);
  cursor: pointer;
  list-style: none;
  font-weight: 700;
}
summary::-webkit-details-marker {
  display: none;
}
.sign {
  position: relative;
  flex: none;
  width: 1.75rem;
  height: 1.75rem;
  border-radius: 50%;
  background: var(--color-accent-soft);
}
.sign::before,
.sign::after {
  content: "";
  position: absolute;
  left: 50%;
  top: 50%;
  width: 10px;
  height: 2px;
  border-radius: 1px;
  background: var(--color-accent);
  transform: translate(-50%, -50%);
  transition: transform var(--transition);
}
.sign::after {
  transform: translate(-50%, -50%) rotate(90deg);
}
.faq[open] .sign::after {
  transform: translate(-50%, -50%) rotate(0deg);
}
.faq p {
  padding: 0 var(--space-5) var(--space-5);
  color: var(--color-text-muted);
}
</style>
