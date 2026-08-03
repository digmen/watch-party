<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";
import { useRoomsStore } from "../stores/rooms.store";

const name = ref("");
const submitting = ref(false);
const error = ref<string | null>(null);

const rooms = useRoomsStore();
const router = useRouter();

async function submit() {
  submitting.value = true;
  error.value = null;
  try {
    const room = await rooms.createRoom(name.value);
    router.push(`/rooms/${room.id}`);
  } catch {
    error.value = "Не удалось создать комнату";
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <main class="create">
    <h1>Новая комната</h1>
    <form @submit.prevent="submit">
      <label>
        Название
        <input v-model="name" required maxlength="80" placeholder="Movie night" />
      </label>
      <p v-if="error" class="error">{{ error }}</p>
      <button type="submit" :disabled="submitting">Создать</button>
    </form>
    <RouterLink to="/">Назад к списку</RouterLink>
  </main>
</template>

<style scoped>
.create {
  max-width: 320px;
  margin: 4rem auto;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
form {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.error {
  color: #d33;
  margin: 0;
}
</style>
