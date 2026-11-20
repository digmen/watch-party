<script setup lang="ts">
// The picture area while there is nothing to play: the server is preparing the video, it failed,
// or the host has not picked one yet.
defineProps<{
  kind: "preparing" | "failed" | "waiting";
  preparingSeconds?: number;
  reason?: string | null;
}>();
</script>

<template>
  <div v-if="kind === 'preparing'" class="placeholder preparing" role="status">
    <span class="spinner" aria-hidden="true"></span>
    <div>
      <p class="p-title">Готовим видео…</p>
      <p class="p-sub">
        Сервер скачивает поток, чтобы он не тормозил ни у кого из вас.
        <template v-if="(preparingSeconds ?? 0) > 8">Уже {{ preparingSeconds }} с — для длинных видео и медленных источников это нормально.</template>
      </p>
    </div>
  </div>

  <div v-else-if="kind === 'failed'" class="placeholder stage-empty" role="alert">
    <span class="icon" aria-hidden="true">!</span>
    <p class="p-title">Не удалось подготовить видео</p>
    <p v-if="reason" class="p-sub">{{ reason }}</p>
  </div>

  <div v-else class="placeholder stage-empty">
    <span class="icon" aria-hidden="true">▶</span>
    <p>Ждём, пока хозяин комнаты выберет, что смотрим…</p>
  </div>
</template>

<style scoped>
.placeholder {
  width: 100%;
  aspect-ratio: 16 / 9;
  max-height: var(--stage-max-h, calc(100dvh - 8rem));
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-4);
  padding: var(--space-5);
  text-align: left;
  border-radius: var(--radius-lg);
  border: 1px solid var(--color-border);
  background:
    radial-gradient(70% 90% at 50% 0%, var(--color-accent-soft), transparent 70%),
    var(--color-surface);
  color: var(--color-text-muted);
}
.stage-empty {
  flex-direction: column;
  gap: var(--space-3);
  text-align: center;
}
.icon {
  width: 3.5rem;
  height: 3.5rem;
  display: grid;
  place-items: center;
  padding-left: 4px;
  border-radius: 50%;
  background: var(--color-surface-raised);
  border: 1px solid var(--color-accent-line);
  color: var(--color-accent);
  font-size: var(--text-xl);
}
.p-title {
  color: var(--color-text);
  font-family: var(--font-display);
  font-weight: 600;
}
.p-sub {
  font-size: var(--text-sm);
  max-width: 28rem;
}
.spinner {
  width: 1.4rem;
  height: 1.4rem;
  border: 3px solid var(--color-border-strong);
  border-top-color: var(--color-accent);
  border-radius: 50%;
  animation: spin 700ms linear infinite;
  flex: none;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
@media (max-width: 40rem) {
  .placeholder {
    border-radius: 0;
    border-inline: none;
    aspect-ratio: 16 / 10;
    padding: var(--space-4);
  }
}
</style>
