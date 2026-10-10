<script setup lang="ts">
import { ref } from "vue";

defineProps<{
  busy: boolean;
  error: string | null;
  hero: boolean;
  canCancel: boolean;
}>();
const emit = defineEmits<{ submit: [url: string]; cancel: [] }>();

const url = ref("");
const SERVICES = ["YouTube", "Twitch", "TikTok", "VK", "ok.ru", "Rutube", "Файл .mp4 / .m3u8"];

function submit() {
  const v = url.value.trim();
  if (v) emit("submit", v);
}
</script>

<template>
  <form class="add" :class="{ hero }" @submit.prevent="submit">
    <div v-if="hero" class="intro">
      <h2>Что смотрим?</h2>
      <p>Вставьте ссылку — друзья увидят то же самое в ту же секунду.</p>
    </div>

    <div class="row">
      <input
        v-model="url"
        data-testid="add-video-input"
        type="url"
        required
        placeholder="Ссылка на видео или трансляцию"
        aria-label="Ссылка на видео"
        autocomplete="off"
        :autofocus="hero"
      />
      <button type="submit" data-testid="add-video-submit" :disabled="busy || !url.trim()">
        {{ busy ? "Добавляем…" : "Смотреть" }}
      </button>
      <button v-if="canCancel" type="button" class="quiet" @click="emit('cancel')">Отмена</button>
    </div>

    <p v-if="error" class="error" role="alert">{{ error }}</p>

    <ul v-if="hero" class="chips" aria-label="Что поддерживается">
      <li v-for="s in SERVICES" :key="s">{{ s }}</li>
    </ul>
  </form>
</template>

<style scoped>
.add {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
.add.hero {
  aspect-ratio: 16 / 9;
  max-height: calc(100dvh - 8rem);
  justify-content: center;
  align-items: center;
  padding: var(--space-6) var(--space-5);
  border-radius: var(--radius-lg);
  background:
    radial-gradient(60% 80% at 50% 0%, rgb(255 107 90 / 0.14), transparent 70%),
    var(--color-surface);
  border: 1px solid var(--color-border);
  text-align: center;
}
.intro h2 {
  font-size: var(--text-xl);
}
.intro p {
  color: var(--color-text-muted);
  margin-top: var(--space-1);
}
.row {
  display: flex;
  gap: var(--space-2);
  width: 100%;
  max-width: 40rem;
}
.row input {
  flex: 1;
  min-width: 0;
  font-size: 16px;
}
.row button {
  white-space: nowrap;
}
.chips {
  list-style: none;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  justify-content: center;
}
.chips li {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-full);
  padding: 0.15rem 0.7rem;
}
@media (max-width: 40rem) {
  .add.hero {
    aspect-ratio: auto;
    border-radius: 0;
    padding: var(--space-5) var(--space-4);
  }
  .row {
    flex-direction: column;
  }
}
</style>
