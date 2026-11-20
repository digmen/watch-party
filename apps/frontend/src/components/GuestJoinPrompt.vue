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
    <div class="glow" aria-hidden="true"></div>

    <div class="panel">
      <span class="badge" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M8 5.5v13l11-6.5z" /></svg>
      </span>
      <span class="eyebrow">Приглашение</span>
      <h1>Вас пригласили посмотреть вместе</h1>
      <p class="lede">Придумайте имя — его увидят остальные в комнате. Регистрация не нужна.</p>

      <form @submit.prevent="submit">
        <input
          v-model="displayName"
          data-testid="guest-name"
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
        <button type="submit" data-testid="guest-submit" :disabled="props.submitting || !displayName.trim()">
          {{ props.submitting ? "Заходим…" : "Смотреть" }}
        </button>
      </form>

      <p v-if="props.error" class="error" role="alert">{{ props.error }}</p>

      <p class="alt">
        Уже есть аккаунт?
        <RouterLink to="/login">Войти</RouterLink>
      </p>
    </div>
  </section>
</template>

<style scoped>
.guest-join {
  position: relative;
  isolation: isolate;
  display: grid;
  place-items: center;
  min-height: calc(100dvh - var(--header-h) - 6rem);
  padding: var(--space-8) var(--gutter) var(--space-10);
}

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
  top: 42%;
  width: min(44rem, 140vw);
  aspect-ratio: 1;
  transform: translate(-50%, -50%);
  background:
    radial-gradient(closest-side at 50% 40%, rgb(255 181 71 / 0.3), transparent 70%),
    radial-gradient(closest-side at 62% 62%, color-mix(in srgb, var(--color-glow) 32%, transparent), transparent 72%);
  filter: blur(10px);
}

.panel {
  width: 100%;
  max-width: 26rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
  padding: clamp(var(--space-5), 5vw, var(--space-8));
  text-align: center;
  background: color-mix(in srgb, var(--color-surface) 88%, transparent);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-lg);
  backdrop-filter: blur(12px);
}

.badge {
  display: grid;
  place-items: center;
  width: 3.5rem;
  height: 3.5rem;
  margin-bottom: var(--space-2);
  border-radius: 50%;
  background: var(--color-accent);
  color: var(--color-accent-contrast);
  box-shadow: var(--shadow-accent);
}

h1 {
  font-size: var(--text-2xl);
}
.lede {
  color: var(--color-text-muted);
  font-size: var(--text-sm);
  margin-bottom: var(--space-4);
}

form {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
form button {
  width: 100%;
  min-height: 3rem;
}

.error {
  margin-top: var(--space-2);
}
.alt {
  margin-top: var(--space-4);
  color: var(--color-text-muted);
  font-size: var(--text-sm);
}
.alt a {
  display: inline-flex;
  align-items: center;
  min-height: 2.75rem;
  padding-inline: var(--space-1);
  font-weight: 600;
}
</style>
