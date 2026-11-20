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
  <main class="auth">
    <div class="glow" aria-hidden="true"></div>

    <section class="panel">
      <header class="intro">
        <span class="eyebrow">{{ mode === "login" ? "Вход" : "Регистрация" }}</span>
        <h1>{{ mode === "login" ? "С возвращением" : "Создать аккаунт" }}</h1>
        <p class="lede">
          Аккаунт нужен только чтобы сохранять комнаты. Посмотреть с другом можно и без него —
          <RouterLink to="/">начать как гость</RouterLink>.
        </p>
      </header>

      <button type="button" class="ghost google" @click="continueWithGoogle">
        <svg class="g" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.8z" />
          <path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1A12 12 0 0 0 12 24z" />
          <path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6h-4a12 12 0 0 0 0 10.8l4-3.1z" />
          <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1c.9-2.9 3.6-4.9 6.7-4.9z" />
        </svg>
        Продолжить с Google
      </button>

      <div class="divider" role="presentation"><span>или по почте</span></div>

      <form @submit.prevent="submit">
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

        <button type="submit" class="submit" :disabled="submitting">
          {{ submitting ? "Минуту…" : mode === "login" ? "Войти" : "Зарегистрироваться" }}
        </button>
      </form>

      <button type="button" class="quiet switch" @click="mode = mode === 'login' ? 'register' : 'login'">
        {{ mode === "login" ? "Нет аккаунта? Зарегистрироваться" : "Уже есть аккаунт? Войти" }}
      </button>
    </section>
  </main>
</template>

<style scoped>
.auth {
  position: relative;
  isolation: isolate;
  display: grid;
  place-items: center;
  min-height: calc(100dvh - var(--header-h) - 6rem);
  padding: var(--space-8) var(--gutter) var(--space-10);
}

/* The projector beam behind the card: amber core, a violet haze to one side. Decorative only. */
.glow {
  position: absolute;
  inset: 0;
  z-index: -1;
  overflow: hidden;
  pointer-events: none;
}
.glow::before {
  content: "";
  position: absolute;
  left: 50%;
  top: 45%;
  width: min(44rem, 140vw);
  aspect-ratio: 1;
  transform: translate(-50%, -50%);
  background:
    radial-gradient(closest-side at 42% 45%, rgb(255 181 71 / 0.3), transparent 70%),
    radial-gradient(closest-side at 64% 58%, color-mix(in srgb, var(--color-glow) 34%, transparent), transparent 72%);
  filter: blur(10px);
}

.panel {
  width: 100%;
  max-width: 26rem;
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  padding: clamp(var(--space-5), 5vw, var(--space-8));
  background: color-mix(in srgb, var(--color-surface) 88%, transparent);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-lg);
  backdrop-filter: blur(12px);
}

.intro {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin-bottom: var(--space-2);
}
h1 {
  font-size: var(--text-2xl);
}
.lede {
  color: var(--color-text-muted);
  font-size: var(--text-sm);
}

.google,
.submit,
.switch {
  width: 100%;
  min-height: 3rem;
}
.switch {
  min-height: 2.75rem;
  white-space: normal;
}
.g {
  flex: none;
}

.divider {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  color: var(--color-text-faint);
  font-size: var(--text-xs);
  text-transform: uppercase;
  letter-spacing: 0.1em;
}
.divider::before,
.divider::after {
  content: "";
  flex: 1;
  height: 1px;
  background: var(--color-border);
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
  font-weight: 600;
}
.submit {
  margin-top: var(--space-1);
}
</style>
