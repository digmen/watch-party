<script setup lang="ts">
import type { PublicRoomDto } from "@watch-party/shared";

defineProps<{ rooms: PublicRoomDto[] }>();

function peopleLabel(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n} участник`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${n} участника`;
  return `${n} участников`;
}

function ago(iso: string): string {
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (min < 1) return "только что";
  if (min < 60) return `${min} мин назад`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} ч назад`;
  return `${Math.round(h / 24)} дн назад`;
}
</script>

<template>
  <ul class="rooms">
    <li v-for="room in rooms" :key="room.id">
      <RouterLink class="card-link" :to="`/rooms/${room.id}`">
        <div class="top">
          <span class="name">{{ room.name }}</span>
          <span v-if="room.requiresPassword" class="lock" title="Нужен пароль" aria-label="Нужен пароль">🔒</span>
        </div>
        <p class="now">{{ room.videoTitle ? `Смотрят: ${room.videoTitle}` : "Видео ещё не выбрано" }}</p>
        <p class="meta">
          <span>{{ room.hostName }}</span>
          <span>·</span>
          <span>{{ peopleLabel(room.memberCount) }}</span>
          <span>·</span>
          <span>{{ ago(room.createdAt) }}</span>
        </p>
      </RouterLink>
    </li>
  </ul>
</template>

<style scoped>
.rooms {
  list-style: none;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(17rem, 1fr));
  gap: var(--space-4);
}
.card-link {
  display: block;
  height: 100%;
  padding: var(--space-4) var(--space-5);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  color: var(--color-text);
  text-decoration: none;
  transition:
    border-color var(--transition),
    transform var(--transition);
}
.card-link:hover {
  border-color: var(--color-accent);
  color: var(--color-text);
  transform: translateY(-2px);
}
.top {
  display: flex;
  justify-content: space-between;
  gap: var(--space-2);
}
.name {
  font-weight: 650;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.now {
  margin-top: var(--space-2);
  color: var(--color-text-muted);
  font-size: var(--text-sm);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.meta {
  margin-top: var(--space-3);
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  color: var(--color-text-faint);
  font-size: var(--text-xs);
}
</style>
