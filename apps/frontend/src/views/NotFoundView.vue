<script setup lang="ts">
import { usePageSeo } from "../seo";

// noindex: a soft-404 in the index is worse than no page at all.
usePageSeo({ title: "Страница не найдена — Watch Party", description: "Такой страницы нет.", path: "/404", noindex: true });
</script>

<template>
  <main class="nf">
    <p class="code">404</p>
    <h1>Здесь ничего нет</h1>
    <p class="lede">Ссылка устарела или в ней опечатка. Если это комната — возможно, её уже закрыли.</p>
    <RouterLink class="btn" to="/">На главную</RouterLink>
  </main>
</template>

<style scoped>
.nf {
  max-width: 28rem;
  margin: 0 auto;
  padding: var(--space-12) var(--space-4);
  text-align: center;
}
.code {
  font-size: var(--text-hero);
  font-weight: 800;
  color: var(--color-accent);
  line-height: 1;
}
h1 {
  margin: var(--space-3) 0;
  font-size: var(--text-2xl);
}
.lede {
  color: var(--color-text-muted);
  margin-bottom: var(--space-6);
}
.btn {
  display: inline-flex;
  padding: var(--space-3) var(--space-6);
  border-radius: var(--radius);
  background: var(--color-accent);
  color: var(--color-accent-contrast);
  font-weight: 600;
  text-decoration: none;
}
</style>
