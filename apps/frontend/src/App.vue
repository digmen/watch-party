<script setup lang="ts">
import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useAuthStore } from "./stores/auth.store";

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();

// The room is the one screen that wants the full viewport for video — the marketing chrome would
// just push the player down and steal attention from it.
const isImmersive = computed(() => route.name === "room-player");

async function logout() {
  await auth.logout();
  router.push("/");
}
</script>

<template>
  <div class="shell">
    <header v-if="!isImmersive" class="site-head">
      <RouterLink class="brand" to="/">
        <span class="mark" aria-hidden="true">◐</span>
        Watch&nbsp;Party
      </RouterLink>

      <nav>
        <RouterLink to="/public">Публичные комнаты</RouterLink>
        <RouterLink to="/about">О проекте</RouterLink>
        <template v-if="auth.isAuthenticated && !auth.isGuest">
          <RouterLink to="/rooms">Комнаты</RouterLink>
          <button class="quiet" @click="logout">Выйти</button>
        </template>
        <RouterLink v-else-if="!auth.isAuthenticated" to="/login">Войти</RouterLink>
      </nav>
    </header>

    <RouterView />

    <footer v-if="!isImmersive" class="site-foot">
      <p class="links">
        <RouterLink to="/public">Публичные комнаты</RouterLink>
        <RouterLink to="/about">О проекте</RouterLink>
        <RouterLink to="/privacy">Конфиденциальность</RouterLink>
        <RouterLink to="/terms">Условия</RouterLink>
      </p>
      <p>Watch Party — совместный просмотр видео для тех, кто далеко друг от друга.</p>
      <p class="legal">
        Сервис не хранит и не размещает видео: воспроизводится только та ссылка, которую указал
        пользователь.
      </p>
    </footer>
  </div>
</template>

<style scoped>
.shell {
  display: flex;
  flex-direction: column;
  min-height: 100dvh;
}

.site-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  padding: var(--space-4) var(--space-5);
  max-width: var(--container);
  width: 100%;
  margin: 0 auto;
}
.brand {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  font-weight: 700;
  color: var(--color-text);
  text-decoration: none;
}
.mark {
  color: var(--color-accent);
  font-size: var(--text-xl);
}
nav {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  font-size: var(--text-sm);
}
nav a {
  color: var(--color-text-muted);
  text-decoration: none;
}
nav a:hover {
  color: var(--color-text);
}

.site-foot {
  margin-top: auto;
  padding: var(--space-8) var(--space-5);
  border-top: 1px solid var(--color-border);
  text-align: center;
  color: var(--color-text-faint);
  font-size: var(--text-sm);
}
.links {
  display: flex;
  gap: var(--space-5);
  justify-content: center;
  flex-wrap: wrap;
  margin-bottom: var(--space-3);
}
.links a {
  color: var(--color-text-muted);
  text-decoration: none;
}
.links a:hover {
  color: var(--color-text);
}
.legal {
  margin-top: var(--space-2);
  max-width: 34rem;
  margin-inline: auto;
}
</style>
