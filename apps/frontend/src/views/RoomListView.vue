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
    <header class="head">
      <div>
        <h1>Комнаты</h1>
        <p class="who">{{ auth.user?.displayName }}</p>
      </div>
      <RouterLink class="create" to="/rooms/new">Создать комнату</RouterLink>
    </header>

    <p v-if="rooms.loading" class="placeholder">Загрузка…</p>

    <div v-else-if="rooms.rooms.length === 0" class="empty card">
      <h2>Здесь пока пусто</h2>
      <p>Создайте комнату, вставьте ссылку на видео и позовите кого-нибудь — ему хватит имени.</p>
      <RouterLink class="create" to="/rooms/new">Создать первую</RouterLink>
    </div>

    <ul v-else class="room-list">
      <li v-for="room in rooms.rooms" :key="room.id">
        <RouterLink :to="`/rooms/${room.id}`">
          <span class="name">{{ room.name }}</span>
          <span class="members">{{ room.members.length }} в комнате</span>
        </RouterLink>
      </li>
    </ul>
  </main>
</template>

<style scoped>
.rooms {
  max-width: var(--container-narrow);
  margin: 0 auto;
  padding: var(--space-6) var(--space-4) var(--space-12);
}
.head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-4);
  margin-bottom: var(--space-6);
}
h1 {
  font-size: var(--text-2xl);
}
.who {
  color: var(--color-text-faint);
  font-size: var(--text-sm);
}
.create {
  display: inline-flex;
  align-items: center;
  padding: var(--space-3) var(--space-5);
  background: var(--color-accent);
  color: var(--color-accent-contrast);
  border-radius: var(--radius);
  font-weight: 600;
  text-decoration: none;
  white-space: nowrap;
}
.create:hover {
  background: var(--color-accent-hover);
  color: var(--color-accent-contrast);
}
.placeholder {
  color: var(--color-text-muted);
}
.empty {
  text-align: center;
}
.empty h2 {
  font-size: var(--text-lg);
  margin-bottom: var(--space-2);
}
.empty p {
  color: var(--color-text-muted);
  margin-bottom: var(--space-5);
}
.room-list {
  list-style: none;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
.room-list a {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-4);
  padding: var(--space-4);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  color: var(--color-text);
  text-decoration: none;
  transition:
    border-color var(--transition),
    background var(--transition);
}
.room-list a:hover {
  border-color: var(--color-accent);
  background: var(--color-surface-raised);
}
.name {
  font-weight: 600;
}
.members {
  color: var(--color-text-faint);
  font-size: var(--text-sm);
  white-space: nowrap;
}
</style>
