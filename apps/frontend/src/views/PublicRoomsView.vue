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
    <header class="head">
      <div>
        <h1>Публичные комнаты</h1>
        <p class="lede">Открытые комнаты за последние семь дней. Заходите — регистрация не нужна.</p>
      </div>
      <RouterLink class="create" to="/">Создать свою</RouterLink>
    </header>

    <div v-if="loading" class="skeleton" aria-hidden="true"><span></span><span></span><span></span><span></span></div>
    <p v-else-if="failed" class="error">Не удалось загрузить список. Обновите страницу.</p>

    <div v-else-if="rooms.length === 0" class="empty card">
      <h2>Пока никого нет</h2>
      <p>Создайте комнату и сделайте её публичной — другие смогут заглянуть и присоединиться.</p>
      <RouterLink class="create" to="/">Создать комнату</RouterLink>
    </div>

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
  max-width: var(--container);
  margin: 0 auto;
  padding: var(--space-8) var(--space-4) var(--space-12);
}
.head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: var(--space-4);
  flex-wrap: wrap;
  margin-bottom: var(--space-6);
}
h1 {
  font-size: var(--text-2xl);
}
.lede,
.placeholder {
  color: var(--color-text-muted);
}
.create {
  display: inline-flex;
  padding: var(--space-3) var(--space-5);
  border-radius: var(--radius);
  background: var(--color-accent);
  color: var(--color-accent-contrast);
  font-weight: 600;
  text-decoration: none;
}
.create:hover {
  background: var(--color-accent-hover);
  color: var(--color-accent-contrast);
}
.empty {
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-3);
  color: var(--color-text-muted);
}
.skeleton {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(17rem, 1fr));
  gap: var(--space-4);
}
.skeleton span {
  height: 7.5rem;
  border-radius: var(--radius-lg);
  background: var(--color-surface);
}
.more {
  margin-top: var(--space-6);
  text-align: center;
}
</style>
