<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";
import { useRoomsStore } from "../stores/rooms.store";

const name = ref("");
const visibility = ref<"public" | "private">("private");
const password = ref("");
const submitting = ref(false);
const error = ref<string | null>(null);

const rooms = useRoomsStore();
const router = useRouter();

async function submit() {
  submitting.value = true;
  error.value = null;
  try {
    const room = await rooms.createRoom(name.value, visibility.value, password.value || undefined);
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
      <fieldset class="vis">
        <legend>Кто может зайти</legend>
        <label class="opt">
          <input v-model="visibility" type="radio" value="private" />
          <span><b>По ссылке</b> Только те, кому вы отправили ссылку.</span>
        </label>
        <label class="opt">
          <input v-model="visibility" type="radio" value="public" />
          <span><b>Публичная</b> Видна в списке на главной, зайти может любой.</span>
        </label>
      </fieldset>

      <label>
        Пароль <span class="opt-hint">(необязательно)</span>
        <input v-model="password" type="text" maxlength="72" autocomplete="off" placeholder="Без пароля — зайдёт любой со ссылкой" />
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
.vis {
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  padding: var(--space-3) var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
.vis legend {
  padding: 0 var(--space-2);
  font-size: var(--text-sm);
  color: var(--color-text-muted);
}
.opt {
  flex-direction: row;
  align-items: flex-start;
  gap: var(--space-3);
  color: var(--color-text);
  cursor: pointer;
}
.opt input {
  width: auto;
  margin-top: 0.3rem;
  accent-color: var(--color-accent);
}
.opt b {
  display: block;
}
.opt span {
  color: var(--color-text-muted);
}
.opt-hint {
  color: var(--color-text-faint);
}
.back {
  margin-top: var(--space-6);
  font-size: var(--text-sm);
}
</style>
