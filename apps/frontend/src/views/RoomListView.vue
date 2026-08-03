<script setup lang="ts">
import { onMounted } from "vue";
import { useAuthStore } from "../stores/auth.store";
import { useRoomsStore } from "../stores/rooms.store";
import { useRouter } from "vue-router";

const auth = useAuthStore();
const rooms = useRoomsStore();
const router = useRouter();

onMounted(() => rooms.fetchRooms());

async function logout() {
  await auth.logout();
  router.push("/login");
}
</script>

<template>
  <main class="rooms">
    <header>
      <h1>Комнаты</h1>
      <div class="user">
        <span>{{ auth.user?.displayName }}</span>
        <button @click="logout">Выйти</button>
      </div>
    </header>

    <RouterLink class="create-link" to="/rooms/new">+ Создать комнату</RouterLink>

    <p v-if="rooms.loading">Загрузка...</p>
    <p v-else-if="rooms.rooms.length === 0" class="placeholder">Пока нет комнат — создайте первую.</p>
    <ul v-else class="room-list">
      <li v-for="room in rooms.rooms" :key="room.id">
        <RouterLink :to="`/rooms/${room.id}`">{{ room.name }}</RouterLink>
        <span class="members">{{ room.members.length }} участник(ов)</span>
      </li>
    </ul>
  </main>
</template>

<style scoped>
.rooms {
  max-width: 640px;
  margin: 2rem auto;
  padding: 0 1rem;
}
header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.user {
  display: flex;
  gap: 0.75rem;
  align-items: center;
}
.create-link {
  display: inline-block;
  margin: 1rem 0;
}
.placeholder {
  color: #777;
  margin-top: 2rem;
}
.room-list {
  list-style: none;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.room-list li {
  display: flex;
  justify-content: space-between;
  border: 1px solid #ddd;
  padding: 0.5rem 0.75rem;
}
.members {
  color: #777;
  font-size: 0.9rem;
}
</style>
