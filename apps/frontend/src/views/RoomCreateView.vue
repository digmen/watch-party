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
    <p class="lede">Назовите её как угодно — название увидят те, кого вы позовёте.</p>

    <form class="card" @submit.prevent="submit">
      <label>
        Название
        <input v-model="name" required maxlength="80" placeholder="Вечер пятницы" autofocus />
      </label>
      <p v-if="error" class="error">{{ error }}</p>
      <button type="submit" :disabled="submitting">{{ submitting ? "Создаём…" : "Создать" }}</button>
    </form>

    <p class="back"><RouterLink to="/rooms">← К списку комнат</RouterLink></p>
  </main>
</template>

<style scoped>
.create {
  max-width: var(--container-narrow);
  margin: 0 auto;
  padding: var(--space-10) var(--space-4);
}
h1 {
  font-size: var(--text-2xl);
  margin-bottom: var(--space-2);
}
.lede {
  color: var(--color-text-muted);
  margin-bottom: var(--space-6);
}
form {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}
label {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  font-size: var(--text-sm);
  color: var(--color-text-muted);
}
.back {
  margin-top: var(--space-6);
  font-size: var(--text-sm);
}
</style>
