<script setup lang="ts">
import { ref } from "vue";

const props = defineProps<{ submitting: boolean; error: string | null; requiresPassword?: boolean }>();
const emit = defineEmits<{ submit: [displayName: string, password: string] }>();

const displayName = ref("");
const password = ref("");

function submit() {
  const name = displayName.value.trim();
  if (name) emit("submit", name, password.value);
}
</script>

<template>
  <section class="guest-join">
    <h1>Вас пригласили посмотреть вместе</h1>
    <p class="lede">Придумайте имя — его увидят остальные в комнате. Регистрация не нужна.</p>

    <form @submit.prevent="submit">
      <input
        v-model="displayName"
        type="text"
        maxlength="32"
        required
        autofocus
        placeholder="Как вас зовут?"
        aria-label="Ваше имя"
      />
      <input
        v-if="props.requiresPassword"
        v-model="password"
        type="password"
        required
        autocomplete="off"
        placeholder="Пароль комнаты"
        aria-label="Пароль комнаты"
      />
      <button type="submit" :disabled="props.submitting || !displayName.trim()">
        {{ props.submitting ? "Заходим…" : "Смотреть" }}
      </button>
    </form>

    <p v-if="props.error" class="error" role="alert">{{ props.error }}</p>

    <p class="alt">
      Уже есть аккаунт?
      <RouterLink to="/login">Войти</RouterLink>
    </p>
  </section>
</template>

<style scoped>
.guest-join {
  max-width: 26rem;
  margin: var(--space-10) auto;
  padding: 0 var(--space-4);
  text-align: center;
}
h1 {
  font-size: var(--text-2xl);
  margin: 0 0 var(--space-2);
}
.lede {
  color: var(--color-text-muted);
  margin: 0 0 var(--space-6);
}
form {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
.alt {
  margin-top: var(--space-6);
  color: var(--color-text-muted);
  font-size: var(--text-sm);
}
</style>
