<script setup lang="ts">
import { ref } from "vue";
import BrandMark from "../ui/BrandMark.vue";

// Every screen shown instead of the room: not found, password, could not enter, entering.
// (The guest name prompt is its own component.)
defineProps<{
  kind: "not-found" | "password" | "error" | "entering";
  busy?: boolean;
  error?: string | null;
}>();
const emit = defineEmits<{ submitPassword: [password: string] }>();

const password = ref("");
</script>

<template>
  <main v-if="kind === 'entering'" class="gate" role="status" data-testid="entering">
    <div class="gate-card">
      <span class="spinner" aria-hidden="true"></span>
      <p class="lede">Заходим в комнату…</p>
    </div>
  </main>

  <main v-else class="gate">
    <div class="gate-card">
      <BrandMark class="mark" :size="44" />

      <template v-if="kind === 'not-found'">
        <h1>Комната не найдена</h1>
        <p class="lede">Ссылка устарела или в ней опечатка. Возможно, комнату уже закрыли.</p>
        <RouterLink class="btn" to="/">На главную</RouterLink>
      </template>

      <template v-else-if="kind === 'password'">
        <h1>Комната под паролем</h1>
        <p class="lede">Введите пароль, который вам сообщил хозяин комнаты.</p>
        <form class="gate-form" @submit.prevent="emit('submitPassword', password)">
          <input v-model="password" type="password" required autofocus autocomplete="off" placeholder="Пароль" aria-label="Пароль комнаты" />
          <button type="submit" :disabled="busy || !password">{{ busy ? "Проверяем…" : "Войти" }}</button>
        </form>
        <p v-if="error" class="error" role="alert">{{ error }}</p>
      </template>

      <template v-else>
        <p class="enter-error error" role="alert">{{ error }}</p>
        <RouterLink class="btn" to="/">На главную</RouterLink>
      </template>
    </div>
  </main>
</template>

<style scoped>
.gate {
  min-height: 100dvh;
  display: grid;
  place-items: center;
  padding: var(--space-6) var(--gutter) max(var(--space-6), env(safe-area-inset-bottom));
  background:
    radial-gradient(50% 40% at 50% 0%, var(--color-accent-soft), transparent 70%),
    var(--color-bg);
}
.gate-card {
  width: 100%;
  max-width: 26rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-3);
  text-align: center;
}
.mark {
  margin-bottom: var(--space-2);
}
h1 {
  font-size: var(--text-2xl);
}
.lede {
  color: var(--color-text-muted);
  margin-bottom: var(--space-2);
}
.gate-form {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
.enter-error {
  max-width: var(--container-narrow);
}
.spinner {
  width: 1.6rem;
  height: 1.6rem;
  border: 3px solid var(--color-border-strong);
  border-top-color: var(--color-accent);
  border-radius: 50%;
  animation: spin 700ms linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
