<script setup lang="ts">
import { usePageSeo } from "../seo";
import { useAuthStore } from "../stores/auth.store";

const auth = useAuthStore();

usePageSeo({
  title: "О сервисе — Watch Party",
  description:
    "Watch Party — совместный просмотр видео для тех, кто далеко друг от друга. Бесплатно, с рекламой между сеансами; без рекламы — на платном плане.",
  path: "/about",
});
</script>

<template>
  <main class="about">
    <section class="hero">
      <p class="eyebrow">Наша миссия</p>
      <h1>Расстояние — не повод смотреть порознь</h1>
      <p class="lede">
        Когда важные люди оказываются в разных городах или странах, вечер кино вдвоём обычно
        превращается в «три, два, один — жми» и всё равно расходится на пару секунд. Watch Party
        существует, чтобы это ощущалось так, будто вы на одном диване — даже когда между вами
        тысячи километров.
      </p>
    </section>

    <section class="how">
      <p class="eyebrow">Как это работает</p>
      <div class="grid">
        <article class="card">
          <h2>Один источник правды</h2>
          <p>
            Позиция плеера живёт на сервере, а не в чьём-то браузере. Все клиенты подстраиваются
            под него мягко, без рывков — даже если у кого-то на телефоне часы спешат.
          </p>
        </article>
        <article class="card">
          <h2>Никаких «догоняю, подожди»</h2>
          <p>
            Видео скачивается и готовится один раз на сервере, а не для каждого зрителя заново —
            тот, кто подключился вторым, третьим, десятым, получает поток так же быстро, как первый.
          </p>
        </article>
        <article class="card">
          <h2>Чат под рукой</h2>
          <p>
            Реакция на грустный момент, шутка на весь фильм, обсуждение — всё рядом с плеером,
            история сохраняется, опоздавший увидит, что пропустил.
          </p>
        </article>
      </div>
    </section>

    <section class="model">
      <p class="eyebrow">Условия</p>
      <h2>Бесплатно. Реклама — единственная плата</h2>
      <p class="model-text">
        Создавать комнаты, приглашать друзей и смотреть вместе — бесплатно, с короткой рекламой
        между сеансами. Для тех, кто предпочитает смотреть совсем без остановок, будет платный план,
        который просто убирает рекламу — ничего больше не меняется. Систему подписки ещё
        разворачиваем, скоро будет доступна.
      </p>
    </section>

    <section class="watch">
      <p class="eyebrow">Что можно смотреть</p>
      <p>
        Прямые ссылки на видеофайлы, HLS- и DASH-потоки, а также ok.ru и VK Видео. Страницы
        со встроенными плеерами сторонних сайтов пока не поддерживаются.
      </p>
    </section>

    <section class="closing">
      <h2>Позовите того, с кем давно собирались что-нибудь посмотреть</h2>
      <RouterLink class="btn" :to="auth.isAuthenticated ? '/rooms' : '/login'">Создать комнату</RouterLink>
    </section>
  </main>
</template>

<style scoped>
.about {
  max-width: var(--container);
  margin: 0 auto;
  padding: var(--space-10) var(--space-4) var(--space-12);
}

.eyebrow {
  text-transform: uppercase;
  letter-spacing: 0.14em;
  font-size: var(--text-xs);
  color: var(--color-accent);
  margin-bottom: var(--space-3);
}

.hero {
  max-width: var(--container-narrow);
  margin: 0 auto var(--space-10);
  text-align: center;
}
.hero h1 {
  font-size: var(--text-3xl);
  letter-spacing: -0.02em;
  margin-bottom: var(--space-4);
}
.lede {
  font-size: var(--text-lg);
  color: var(--color-text-muted);
}

.how {
  padding: var(--space-8) 0;
}
.how .eyebrow {
  text-align: center;
  display: block;
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr));
  gap: var(--space-4);
  margin-top: var(--space-5);
}
.card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: var(--space-5);
  box-shadow: var(--shadow-sm);
}
.card h2 {
  font-size: var(--text-lg);
  margin-bottom: var(--space-2);
}
.card p {
  color: var(--color-text-muted);
  font-size: var(--text-sm);
}

.model {
  max-width: var(--container-narrow);
  margin: var(--space-8) auto;
  text-align: center;
  padding: var(--space-6);
  background: var(--color-surface-raised);
  border-radius: var(--radius-lg);
}
.model h2 {
  font-size: var(--text-xl);
  margin-bottom: var(--space-3);
}
.model-text {
  color: var(--color-text-muted);
}

.watch {
  max-width: var(--container-narrow);
  margin: var(--space-8) auto 0;
  text-align: center;
}
.watch p:not(.eyebrow) {
  color: var(--color-text-muted);
}

.closing {
  text-align: center;
  padding: var(--space-10) 0 0;
}
.closing h2 {
  font-size: var(--text-2xl);
  margin-bottom: var(--space-5);
}
.btn {
  display: inline-flex;
  align-items: center;
  padding: var(--space-3) var(--space-6);
  border-radius: var(--radius);
  font-weight: 600;
  text-decoration: none;
  background: var(--color-accent);
  color: var(--color-accent-contrast);
  transition: background var(--transition);
}
.btn:hover {
  background: var(--color-accent-hover);
}
</style>
