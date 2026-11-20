<script setup lang="ts">
import type { PublicRoomDto } from "@watch-party/shared";
import { onMounted, ref } from "vue";
import { roomsApi } from "../api/rooms.api";
import PublicRoomList from "../components/PublicRoomList.vue";
import { usePageSeo } from "../seo";

usePageSeo({
  title: "Публичные комнаты — Watch Party",
  description: "Открытые комнаты, где прямо сейчас смотрят вместе. Заходите и присоединяйтесь.",
  path: "/public",
});

const PAGE = 24;
const rooms = ref<PublicRoomDto[]>([]);
const loading = ref(true);
const loadingMore = ref(false);
const hasMore = ref(false);
const failed = ref(false);

async function load(more = false) {
  if (more) loadingMore.value = true;
  try {
    const { rooms: page } = await roomsApi.publicList(PAGE, more ? rooms.value.length : 0);
    rooms.value = more ? [...rooms.value, ...page] : page;
    hasMore.value = page.length === PAGE;
  } catch {
    failed.value = true;
  } finally {
    loading.value = false;
    loadingMore.value = false;
  }
}

onMounted(() => load());
</script>

<template>
  <main class="public">
    <header class="page-head">
      <div class="head-text">
        <span class="eyebrow"><span class="live" aria-hidden="true"></span>Сейчас смотрят</span>
        <h1>Публичные комнаты</h1>
        <p class="lede">Открытые комнаты за последние семь дней. Заходите — регистрация не нужна.</p>
      </div>
      <RouterLink class="btn head-action" to="/">Создать свою</RouterLink>
    </header>

    <div v-if="loading" class="grid" role="status">
      <span class="visually-hidden">Загрузка…</span>
      <div v-for="n in 6" :key="n" class="skeleton" aria-hidden="true">
        <span class="sk-band"></span>
        <span class="sk-line w70"></span>
        <span class="sk-line w40"></span>
      </div>
    </div>

    <section v-else-if="failed" class="state state-error" role="alert">
      <h2>Не удалось загрузить список</h2>
      <p>Обновите страницу.</p>
    </section>

    <section v-else-if="rooms.length === 0" class="state">
      <div class="state-art" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="9" cy="8" r="3.5" />
          <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
          <path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6.5 6.5 0 0 1 3.5 6" />
        </svg>
      </div>
      <h2>Пока никого нет</h2>
      <p>Создайте комнату и сделайте её публичной — другие смогут заглянуть и присоединиться.</p>
      <RouterLink class="btn" to="/">Создать комнату</RouterLink>
    </section>

    <template v-else>
      <PublicRoomList :rooms="rooms" />
      <p v-if="hasMore" class="more">
        <button class="ghost" :disabled="loadingMore" @click="load(true)">
          {{ loadingMore ? "Загружаем…" : "Показать ещё" }}
        </button>
      </p>
    </template>
  </main>
</template>

<style scoped>
.public {
  width: 100%;
  max-width: var(--container);
  margin: 0 auto;
  padding: var(--space-8) var(--gutter) var(--space-12);
}

.page-head {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  margin-bottom: var(--space-6);
}
.head-text {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  min-width: 0;
}
h1 {
  font-size: var(--text-3xl);
}
.lede {
  color: var(--color-text-muted);
  max-width: 36rem;
}
.head-action {
  align-self: stretch;
}
@media (min-width: 640px) {
  .page-head {
    flex-direction: row;
    align-items: flex-end;
    justify-content: space-between;
  }
  .head-action {
    align-self: auto;
  }
}

.live {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 50%;
  background: var(--color-accent);
  box-shadow: 0 0 0 4px var(--color-accent-soft);
  animation: pulse 2s ease-in-out infinite;
}
@keyframes pulse {
  50% {
    opacity: 0.4;
  }
}

/* Same 1 / 2 / 3 column grid as PublicRoomList, so the skeleton swaps in place. */
.grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--space-3);
}
@media (min-width: 640px) {
  .grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--space-4);
  }
}
@media (min-width: 1024px) {
  .grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
.skeleton {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-3) var(--space-5);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
}
.sk-band,
.sk-line {
  background: linear-gradient(90deg, var(--color-surface-raised) 0%, var(--color-surface-hover) 50%, var(--color-surface-raised) 100%);
  background-size: 200% 100%;
  animation: shimmer 1.4s ease-in-out infinite;
}
.sk-band {
  height: 5.5rem;
  border-radius: var(--radius);
  margin-bottom: var(--space-1);
}
.sk-line {
  height: 0.8rem;
  margin-inline: var(--space-2);
  border-radius: var(--radius-full);
}
.w70 {
  width: 70%;
}
.w40 {
  width: 40%;
}
@keyframes shimmer {
  from {
    background-position: 100% 0;
  }
  to {
    background-position: -100% 0;
  }
}

.state {
  position: relative;
  isolation: isolate;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-10) var(--space-5);
  text-align: center;
  background: var(--color-surface);
  border: 1px dashed var(--color-border-strong);
  border-radius: var(--radius-xl);
}
.state::before {
  content: "";
  position: absolute;
  inset: -40% 10% auto;
  height: 80%;
  z-index: -1;
  background: radial-gradient(closest-side, color-mix(in srgb, var(--color-glow) 16%, transparent), transparent);
  pointer-events: none;
}
.state-art {
  display: grid;
  place-items: center;
  width: 3.5rem;
  height: 3.5rem;
  margin-bottom: var(--space-2);
  border-radius: var(--radius-lg);
  background: var(--color-accent-soft);
  color: var(--color-accent);
}
.state h2 {
  font-size: var(--text-xl);
}
.state p {
  max-width: 28rem;
  margin-bottom: var(--space-3);
  color: var(--color-text-muted);
}
.state-error {
  border-style: solid;
  border-color: rgb(255 107 107 / 0.3);
  background: var(--color-danger-soft);
}
.state-error h2 {
  color: var(--color-danger);
}

.more {
  margin-top: var(--space-6);
  display: flex;
  justify-content: center;
}
.more button {
  width: 100%;
  max-width: 20rem;
}
</style>
