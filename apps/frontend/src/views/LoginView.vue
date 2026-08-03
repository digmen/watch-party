<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";
import { useAuthStore } from "../stores/auth.store";
import { API_ORIGIN } from "../api/client";

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
    router.push("/");
  } catch {
    // auth.error already holds the message; template renders it.
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
    <h1>Watch Party</h1>

    <form @submit.prevent="submit">
      <label>
        Email
        <input v-model="email" type="email" required autocomplete="email" />
      </label>
      <label>
        Пароль
        <input v-model="password" type="password" required minlength="8" autocomplete="current-password" />
      </label>

      <p v-if="auth.error" class="error">{{ auth.error }}</p>

      <button type="submit" :disabled="submitting">
        {{ mode === "login" ? "Войти" : "Зарегистрироваться" }}
      </button>
    </form>

    <button type="button" class="google" @click="continueWithGoogle">Войти через Google</button>

    <button type="button" class="switch" @click="mode = mode === 'login' ? 'register' : 'login'">
      {{ mode === "login" ? "Нет аккаунта? Зарегистрироваться" : "Уже есть аккаунт? Войти" }}
    </button>
  </main>
</template>

<style scoped>
.login {
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
label {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}
.error {
  color: #d33;
  margin: 0;
}
.switch,
.google {
  background: none;
  border: 1px solid #ccc;
  padding: 0.5rem;
  cursor: pointer;
}
</style>
