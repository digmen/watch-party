<script setup lang="ts">
import { usePageSeo } from "../seo";

// noindex: a soft-404 in the index is worse than no page at all.
usePageSeo({ title: "Страница не найдена — Watch Party", description: "Такой страницы нет.", path: "/404", noindex: true });
</script>

<template>
  <main class="nf">
    <div class="glow" aria-hidden="true"></div>
    <div class="container inner">
      <div class="screen" aria-hidden="true">
        <span class="code">404</span>
        <span class="noise"></span>
      </div>
      <p class="eyebrow">Сеанс не найден</p>
      <h1>Здесь ничего нет</h1>
      <p class="lede">Ссылка устарела или в ней опечатка. Если это комната — возможно, её уже закрыли.</p>
      <div class="actions">
        <RouterLink class="btn" to="/">На главную</RouterLink>
        <RouterLink class="btn ghost" to="/public">Публичные комнаты</RouterLink>
      </div>
    </div>
  </main>
</template>

<style scoped>
.nf {
  position: relative;
  isolation: isolate;
  padding: var(--space-10) 0 var(--space-12);
  text-align: center;
}
.glow {
  position: absolute;
  inset: -4rem 0 auto;
  height: 30rem;
  z-index: -1;
  pointer-events: none;
  background:
    radial-gradient(35% 50% at 50% 20%, rgb(255 181 71 / 0.16), transparent 70%),
    radial-gradient(30% 40% at 70% 40%, color-mix(in srgb, var(--color-glow) 18%, transparent), transparent 70%);
}
.inner {
  max-width: 32rem;
}
/* An empty cinema screen with the code projected on it. */
.screen {
  position: relative;
  display: grid;
  place-items: center;
  aspect-ratio: 16 / 9;
  max-width: 20rem;
  margin: 0 auto var(--space-6);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-lg);
  background:
    radial-gradient(60% 70% at 50% 40%, rgb(255 181 71 / 0.18), transparent 70%),
    var(--color-surface);
  box-shadow: var(--shadow-lg);
  overflow: hidden;
}
.noise {
  position: absolute;
  inset: 0;
  background: repeating-linear-gradient(0deg, rgb(255 255 255 / 0.03) 0 2px, transparent 2px 4px);
  pointer-events: none;
}
.code {
  font-family: var(--font-display);
  font-size: clamp(3.5rem, 18vw, 5.5rem);
  font-weight: 700;
  letter-spacing: -0.05em;
  line-height: 1;
  background: linear-gradient(180deg, #ffd99a, var(--color-accent));
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
.eyebrow {
  margin-bottom: var(--space-3);
}
h1 {
  font-size: var(--text-3xl);
  margin-bottom: var(--space-3);
}
.lede {
  color: var(--color-text-muted);
  margin-bottom: var(--space-6);
}
.actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: var(--space-3);
}
</style>
