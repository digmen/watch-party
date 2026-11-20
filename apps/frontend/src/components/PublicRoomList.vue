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
      <RouterLink class="room" :to="`/rooms/${room.id}`">
        <div class="screen" :class="{ idle: !room.videoTitle }">
          <span class="play" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M8 5.5v13l11-6.5z" /></svg>
          </span>
          <p class="now">{{ room.videoTitle ? `Смотрят: ${room.videoTitle}` : "Видео ещё не выбрано" }}</p>
          <span v-if="room.requiresPassword" class="lock" title="Нужен пароль" aria-label="Нужен пароль">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <rect x="4" y="11" width="16" height="10" rx="2" />
              <path d="M8 11V7a4 4 0 0 1 8 0v4" />
            </svg>
          </span>
        </div>
        <div class="info">
          <span class="name">{{ room.name }}</span>
          <p class="meta">
            <span class="host">{{ room.hostName }}</span>
            <span aria-hidden="true">·</span>
            <span>{{ peopleLabel(room.memberCount) }}</span>
            <span aria-hidden="true">·</span>
            <span>{{ ago(room.createdAt) }}</span>
          </p>
        </div>
      </RouterLink>
    </li>
  </ul>
</template>

<style scoped>
.rooms {
  list-style: none;
  padding: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--space-3);
}
@media (min-width: 640px) {
  .rooms {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--space-4);
  }
}
@media (min-width: 1024px) {
  .rooms {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

.room {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  height: 100%;
  padding: var(--space-3) var(--space-3) var(--space-4);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  color: var(--color-text);
  text-decoration: none;
  transition:
    border-color var(--transition),
    background var(--transition),
    transform var(--transition);
}
.room:hover {
  color: var(--color-text);
  border-color: var(--color-accent-line);
  background: var(--color-surface-raised);
  transform: translateY(-2px);
}

/* A little "screen" with what's playing — the room's poster, built from data we already have. */
.screen {
  position: relative;
  display: flex;
  align-items: flex-end;
  gap: var(--space-3);
  min-height: 5.5rem;
  padding: var(--space-3);
  border-radius: var(--radius);
  background:
    radial-gradient(70% 90% at 15% 0%, rgb(255 181 71 / 0.3), transparent 70%),
    radial-gradient(60% 80% at 100% 100%, color-mix(in srgb, var(--color-glow) 30%, transparent), transparent 70%),
    var(--color-surface-raised);
  overflow: hidden;
}
.screen.idle {
  background:
    radial-gradient(60% 80% at 100% 100%, color-mix(in srgb, var(--color-glow) 14%, transparent), transparent 70%),
    var(--color-surface-raised);
}
.play {
  flex: none;
  display: grid;
  place-items: center;
  width: 2rem;
  height: 2rem;
  border-radius: 50%;
  background: var(--color-accent);
  color: var(--color-accent-contrast);
  transition: transform var(--transition);
}
.idle .play {
  background: var(--color-surface-hover);
  color: var(--color-text-faint);
}
.room:hover .play {
  transform: scale(1.08);
}
.now {
  min-width: 0;
  font-size: var(--text-sm);
  font-weight: 600;
  line-height: 1.35;
  color: var(--color-text);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  overflow-wrap: anywhere;
}
.idle .now {
  color: var(--color-text-muted);
  font-weight: 500;
}
.lock {
  position: absolute;
  top: var(--space-2);
  right: var(--space-2);
  display: grid;
  place-items: center;
  width: 1.75rem;
  height: 1.75rem;
  border-radius: 50%;
  background: rgb(0 0 0 / 0.45);
  color: var(--color-accent);
}

.info {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  padding-inline: var(--space-2);
  min-width: 0;
}
.name {
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.meta {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1) var(--space-2);
  color: var(--color-text-faint);
  font-size: var(--text-xs);
}
.host {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--color-text-muted);
}
</style>
