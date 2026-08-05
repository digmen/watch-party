<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";
import { API_ORIGIN } from "../api/client";
import { useAuthStore } from "../stores/auth.store";

const auth = useAuthStore();
const router = useRouter();

const mode = ref<"login" | "register">("login");
const email = ref("");
const password = ref("");
const submitting = ref(false);

async function submit() {
  submitting.value = true;
  try {
    if (mode.value === "login") {
      await auth.login(email.value, password.value);
    } else {
      await auth.register(email.value, password.value);
    }
    // "/" is the public landing now — a freshly logged-in user wants their rooms.
    router.push("/rooms");
  } catch {
    // auth.error already holds the message; the template renders it.
  } finally {
    submitting.value = false;
  }
}

function continueWithGoogle() {
  window.location.href = `${API_ORIGIN}/auth/google`;
}
</script>

<template>
  <main class="login">
    <h1>{{ mode === "login" ? "С возвращением" : "Создать аккаунт" }}</h1>
    <p class="lede">Аккаунт нужен, чтобы создавать комнаты. Чтобы присоединиться к другу — нет.</p>

    <form class="card" @submit.prevent="submit">
      <label>
        Email
        <input v-model="email" type="email" required autocomplete="email" />
      </label>
      <label>
        Пароль
        <input
          v-model="password"
          type="password"
          required
          minlength="8"
          :autocomplete="mode === 'login' ? 'current-password' : 'new-password'"
        />
      </label>

      <p v-if="auth.error" class="error" role="alert">{{ auth.error }}</p>

      <button type="submit" :disabled="submitting">
        {{ submitting ? "Минуту…" : mode === "login" ? "Войти" : "Зарегистрироваться" }}
      </button>
    </form>

    <button type="button" class="ghost full" @click="continueWithGoogle">Продолжить с Google</button>

    <button type="button" class="quiet full" @click="mode = mode === 'login' ? 'register' : 'login'">
      {{ mode === "login" ? "Нет аккаунта? Зарегистрироваться" : "Уже есть аккаунт? Войти" }}
    </button>
  </main>
</template>

<style scoped>
.login {
  max-width: 24rem;
  margin: 0 auto;
  padding: var(--space-10) var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
h1 {
  font-size: var(--text-2xl);
}
.lede {
  color: var(--color-text-muted);
  font-size: var(--text-sm);
  margin-bottom: var(--space-3);
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
.full {
  width: 100%;
}
</style>
