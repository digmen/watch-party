<script setup lang="ts">
import { onMounted } from "vue";
import { useAuthStore } from "../stores/auth.store";
import { useRoomsStore } from "../stores/rooms.store";

const auth = useAuthStore();
const rooms = useRoomsStore();

onMounted(() => rooms.fetchRooms());
</script>

<template>
  <main class="rooms">
    <header class="page-head">
      <div class="head-text">
        <span class="eyebrow">Мои комнаты</span>
        <h1>Комнаты</h1>
        <p v-if="auth.user?.displayName" class="lede">
          Вы вошли как <b>{{ auth.user.displayName }}</b>
        </p>
      </div>
      <RouterLink class="btn head-action" to="/rooms/new">Создать комнату</RouterLink>
    </header>

    <div v-if="rooms.loading" class="grid" role="status">
      <span class="visually-hidden">Загрузка…</span>
      <div v-for="n in 6" :key="n" class="skeleton" aria-hidden="true">
        <span class="sk-tile"></span>
        <span class="sk-lines"><span></span><span></span></span>
      </div>
    </div>

    <section v-else-if="rooms.rooms.length === 0" class="empty">
      <div class="empty-art" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <rect x="2" y="5" width="20" height="14" rx="3" />
          <path d="m10 9 5 3-5 3z" />
        </svg>
      </div>
      <h2>Здесь пока пусто</h2>
      <p>Создайте комнату, вставьте ссылку на видео и позовите кого-нибудь — ему хватит имени.</p>
      <RouterLink class="btn" to="/rooms/new">Создать первую</RouterLink>
    </section>

    <ul v-else class="grid">
      <li v-for="room in rooms.rooms" :key="room.id">
        <RouterLink class="room" :to="`/rooms/${room.id}`">
          <span class="tile" aria-hidden="true">{{ room.name.trim().charAt(0).toUpperCase() || "▶" }}</span>
          <span class="body">
            <span class="name">{{ room.name }}</span>
            <span class="meta">
              <span>{{ room.members.length }} в комнате</span>
              <span class="badge">{{ room.visibility === "public" ? "Публичная" : "По ссылке" }}</span>
              <span v-if="room.hasPassword" class="badge">С паролем</span>
            </span>
          </span>
          <span class="go" aria-hidden="true">→</span>
        </RouterLink>
      </li>
    </ul>
  </main>
</template>

<style scoped>
.rooms {
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
  overflow-wrap: anywhere;
}
.lede b {
  color: var(--color-text);
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

.grid {
  list-style: none;
  padding: 0;
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

.room {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  height: 100%;
  min-height: 5.5rem;
  padding: var(--space-4);
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
.tile {
  flex: none;
  display: grid;
  place-items: center;
  width: 3.25rem;
  height: 3.25rem;
  border-radius: var(--radius);
  background:
    radial-gradient(circle at 30% 25%, rgb(255 181 71 / 0.55), transparent 65%),
    linear-gradient(140deg, color-mix(in srgb, var(--color-glow) 45%, var(--color-surface-raised)), var(--color-surface-raised));
  font-family: var(--font-display);
  font-size: var(--text-lg);
  font-weight: 600;
  color: var(--color-text);
}
.body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
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
  align-items: center;
  gap: var(--space-1) var(--space-2);
  color: var(--color-text-faint);
  font-size: var(--text-xs);
}
.badge {
  padding: 0.1rem var(--space-2);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-full);
  color: var(--color-text-muted);
}
.go {
  flex: none;
  color: var(--color-text-faint);
  transition:
    color var(--transition),
    transform var(--transition);
}
.room:hover .go {
  color: var(--color-accent);
  transform: translateX(2px);
}

/* Skeleton mirrors the card shape so the page doesn't jump when rooms arrive. */
.skeleton {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  min-height: 5.5rem;
  padding: var(--space-4);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
}
.sk-tile,
.sk-lines span {
  background: linear-gradient(90deg, var(--color-surface-raised) 0%, var(--color-surface-hover) 50%, var(--color-surface-raised) 100%);
  background-size: 200% 100%;
  animation: shimmer 1.4s ease-in-out infinite;
}
.sk-tile {
  flex: none;
  width: 3.25rem;
  height: 3.25rem;
  border-radius: var(--radius);
}
.sk-lines {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
.sk-lines span {
  height: 0.8rem;
  border-radius: var(--radius-full);
}
.sk-lines span:first-child {
  width: 70%;
}
.sk-lines span:last-child {
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

.empty {
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
.empty::before {
  content: "";
  position: absolute;
  inset: -40% 10% auto;
  height: 80%;
  z-index: -1;
  background: radial-gradient(closest-side, rgb(255 181 71 / 0.12), transparent);
  pointer-events: none;
}
.empty-art {
  display: grid;
  place-items: center;
  width: 3.5rem;
  height: 3.5rem;
  margin-bottom: var(--space-2);
  border-radius: var(--radius-lg);
  background: var(--color-accent-soft);
  color: var(--color-accent);
}
.empty h2 {
  font-size: var(--text-xl);
}
.empty p {
  max-width: 28rem;
  margin-bottom: var(--space-3);
  color: var(--color-text-muted);
}
</style>
