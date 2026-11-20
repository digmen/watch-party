<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import BrandMark from "./components/ui/BrandMark.vue";
import { useAuthStore } from "./stores/auth.store";

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();

// The room is the one screen that wants the full viewport for video — the marketing chrome would
// just push the player down and steal attention from it.
const isImmersive = computed(() => route.name === "room-player");

// Phone menu. Closes on every navigation so a tapped link never leaves it hanging open.
const menuOpen = ref(false);
watch(
  () => route.fullPath,
  () => {
    menuOpen.value = false;
  },
);

async function logout() {
  menuOpen.value = false;
  await auth.logout();
  router.push("/");
}
</script>

<template>
  <div class="shell">
    <header v-if="!isImmersive" class="site-head" :class="{ open: menuOpen }">
      <div class="head-inner">
        <RouterLink class="brand" to="/">
          <BrandMark :size="30" />
          <span>Watch Party</span>
        </RouterLink>

        <button
          class="quiet icon burger"
          :aria-expanded="menuOpen"
          aria-controls="site-nav"
          :aria-label="menuOpen ? 'Закрыть меню' : 'Открыть меню'"
          @click="menuOpen = !menuOpen"
        >
          <span class="bars" aria-hidden="true"><i /><i /><i /></span>
        </button>

        <nav id="site-nav">
          <RouterLink to="/public">Публичные комнаты</RouterLink>
          <RouterLink to="/about">О проекте</RouterLink>
          <template v-if="auth.isAuthenticated">
            <RouterLink to="/rooms">Мои комнаты</RouterLink>
            <RouterLink v-if="auth.isGuest" class="btn nav-cta" to="/login">Войти</RouterLink>
            <button v-else class="ghost nav-cta" @click="logout">Выйти</button>
          </template>
          <RouterLink v-else class="btn nav-cta" to="/login">Войти</RouterLink>
        </nav>
      </div>
    </header>

    <div class="page">
      <RouterView />
    </div>

    <footer v-if="!isImmersive" class="site-foot">
      <div class="foot-inner">
        <div class="foot-brand">
          <RouterLink class="brand" to="/">
            <BrandMark :size="26" />
            <span>Watch Party</span>
          </RouterLink>
          <p>Совместный просмотр видео для тех, кто далеко друг от друга.</p>
        </div>
        <nav class="links" aria-label="Ссылки в подвале">
          <RouterLink to="/public">Публичные комнаты</RouterLink>
          <RouterLink to="/about">О проекте</RouterLink>
          <RouterLink to="/privacy">Конфиденциальность</RouterLink>
          <RouterLink to="/terms">Условия</RouterLink>
        </nav>
      </div>
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
.page {
  flex: 1;
  display: flex;
  flex-direction: column;
}

/* --- Header --------------------------------------------------------------- */
.site-head {
  position: sticky;
  top: 0;
  z-index: 50;
  background: rgb(8 8 11 / 0.72);
  backdrop-filter: saturate(160%) blur(14px);
  -webkit-backdrop-filter: saturate(160%) blur(14px);
  border-bottom: 1px solid rgb(255 255 255 / 0.05);
}
.head-inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  height: var(--header-h);
  max-width: var(--container);
  margin: 0 auto;
  padding-inline: var(--gutter);
}
.brand {
  display: inline-flex;
  align-items: center;
  gap: var(--space-3);
  font-family: var(--font-display);
  font-weight: 600;
  font-size: 1.05rem;
  letter-spacing: -0.02em;
  color: var(--color-text);
  text-decoration: none;
}
.brand:hover {
  color: var(--color-text);
}

nav {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  font-size: var(--text-sm);
  font-weight: 600;
}
nav a:not(.btn) {
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-full);
  color: var(--color-text-muted);
  text-decoration: none;
  transition:
    color var(--transition),
    background var(--transition);
}
nav a:not(.btn):hover,
nav a.router-link-active:not(.btn) {
  color: var(--color-text);
  background: var(--color-surface-raised);
}
.nav-cta {
  margin-left: var(--space-2);
  min-height: 2.4rem;
  padding-block: var(--space-2);
  font-size: var(--text-sm);
}

.burger {
  display: none;
}
.bars {
  display: grid;
  gap: 4px;
  width: 18px;
}
.bars i {
  display: block;
  height: 2px;
  border-radius: 2px;
  background: currentColor;
  transition:
    transform var(--transition),
    opacity var(--transition);
}
.open .bars i:nth-child(1) {
  transform: translateY(6px) rotate(45deg);
}
.open .bars i:nth-child(2) {
  opacity: 0;
}
.open .bars i:nth-child(3) {
  transform: translateY(-6px) rotate(-45deg);
}

/* Phone: links collapse behind the burger into a full-width sheet under the bar. */
@media (max-width: 47.99rem) {
  .burger {
    display: inline-flex;
    color: var(--color-text);
  }
  nav {
    position: absolute;
    top: var(--header-h);
    left: 0;
    right: 0;
    flex-direction: column;
    align-items: stretch;
    gap: var(--space-1);
    padding: var(--space-3) var(--gutter) var(--space-5);
    background: var(--color-bg);
    border-bottom: 1px solid var(--color-border);
    font-size: var(--text-base);
    /* Hidden but kept in layout flow for the transition. */
    visibility: hidden;
    opacity: 0;
    transform: translateY(-8px);
    transition:
      opacity var(--transition),
      transform var(--transition),
      visibility var(--transition);
  }
  .open nav {
    visibility: visible;
    opacity: 1;
    transform: none;
  }
  nav a:not(.btn) {
    padding: var(--space-3) var(--space-4);
    border-radius: var(--radius);
  }
  .nav-cta {
    margin: var(--space-2) 0 0;
    min-height: 2.9rem;
  }
}

/* --- Footer --------------------------------------------------------------- */
.site-foot {
  margin-top: auto;
  padding: var(--space-8) var(--gutter) var(--space-6);
  border-top: 1px solid var(--color-border);
  color: var(--color-text-faint);
  font-size: var(--text-sm);
}
.foot-inner {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: var(--space-5);
  max-width: var(--container);
  margin: 0 auto;
}
.foot-brand {
  display: grid;
  gap: var(--space-2);
  max-width: 22rem;
}
.links {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2) var(--space-5);
  align-content: flex-start;
}
.links a {
  color: var(--color-text-muted);
  text-decoration: none;
}
.links a:hover {
  color: var(--color-text);
}
.legal {
  max-width: var(--container);
  margin: var(--space-6) auto 0;
  padding-top: var(--space-4);
  border-top: 1px solid rgb(255 255 255 / 0.04);
  font-size: var(--text-xs);
}
</style>
