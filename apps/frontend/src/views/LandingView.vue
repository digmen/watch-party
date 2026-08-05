<script setup lang="ts">
import { usePageSeo } from "../seo";
import { useAuthStore } from "../stores/auth.store";

const auth = useAuthStore();

usePageSeo({
  title: "Watch Party — смотрите видео вместе с друзьями онлайн",
  description:
    "Совместный просмотр видео в реальном времени: создайте комнату, отправьте ссылку другу и смотрите синхронно — пауза и перемотка у всех сразу, рядом чат. Друзьям регистрация не нужна.",
  path: "/",
});
</script>

<template>
  <main class="landing">
    <section class="hero">
      <p class="eyebrow">Совместный просмотр</p>
      <h1>Смотрите вместе,<br />даже если вы в разных городах</h1>
      <p class="lede">
        Отправьте другу ссылку — и вы окажетесь на одной секунде фильма. Пауза у одного
        останавливает у всех, перемотка синхронна, рядом идёт чат.
      </p>

      <div class="cta">
        <RouterLink v-if="auth.isAuthenticated" class="btn" to="/rooms">Мои комнаты</RouterLink>
        <RouterLink v-else class="btn" to="/login">Создать комнату</RouterLink>
        <a class="btn-ghost" href="#how">Как это работает</a>
      </div>

      <p class="note">Друзьям регистрация не нужна — достаточно ввести имя.</p>
    </section>

    <section id="how" class="how">
      <h2>Три шага</h2>
      <ol class="steps">
        <li>
          <span class="step-num">1</span>
          <h3>Создайте комнату</h3>
          <p>И вставьте ссылку на видео — прямой файл, HLS-поток, ok.ru или VK Видео.</p>
        </li>
        <li>
          <span class="step-num">2</span>
          <h3>Отправьте ссылку</h3>
          <p>Другу, девушке, компании. Они вводят имя и сразу попадают в комнату.</p>
        </li>
        <li>
          <span class="step-num">3</span>
          <h3>Смотрите синхронно</h3>
          <p>Плеер держит всех на одной секунде и подстраивается под расхождение часов.</p>
        </li>
      </ol>
    </section>

    <section class="features">
      <article class="card">
        <h3>Нагрузка на сервере, а не на вас</h3>
        <p>
          Видео скачивается и подготавливается на сервере один раз, а дальше раздаётся всем
          зрителям из кэша — источник не дёргают заново на каждого.
        </p>
      </article>
      <article class="card">
        <h3>Действительно синхронно</h3>
        <p>
          Позиция хранится на сервере, а клиент постоянно сверяет часы и мягко подтягивает
          скорость, если отстал — без рывков.
        </p>
      </article>
      <article class="card">
        <h3>Чат рядом с видео</h3>
        <p>История сохраняется, так что опоздавший увидит, что успели обсудить до него.</p>
      </article>
    </section>

    <section class="closing">
      <h2>Позовите того, с кем давно собирались что-нибудь посмотреть</h2>
      <RouterLink class="btn" :to="auth.isAuthenticated ? '/rooms' : '/login'">Начать</RouterLink>
    </section>
  </main>
</template>

<style scoped>
.landing {
  max-width: var(--container);
  margin: 0 auto;
  padding: 0 var(--space-4) var(--space-12);
}

.hero {
  padding: var(--space-12) 0 var(--space-10);
  text-align: center;
}
.eyebrow {
  text-transform: uppercase;
  letter-spacing: 0.14em;
  font-size: var(--text-xs);
  color: var(--color-accent);
  margin-bottom: var(--space-4);
}
h1 {
  font-size: var(--text-hero);
  letter-spacing: -0.02em;
  margin-bottom: var(--space-5);
}
.lede {
  max-width: 34rem;
  margin: 0 auto var(--space-6);
  color: var(--color-text-muted);
  font-size: var(--text-lg);
}
.cta {
  display: flex;
  gap: var(--space-3);
  justify-content: center;
  flex-wrap: wrap;
}
.btn,
.btn-ghost {
  display: inline-flex;
  align-items: center;
  padding: var(--space-3) var(--space-6);
  border-radius: var(--radius);
  font-weight: 600;
  text-decoration: none;
  transition: background var(--transition);
}
.btn {
  background: var(--color-accent);
  color: var(--color-accent-contrast);
}
.btn:hover {
  background: var(--color-accent-hover);
  color: var(--color-accent-contrast);
}
.btn-ghost {
  border: 1px solid var(--color-border-strong);
  color: var(--color-text);
}
.btn-ghost:hover {
  background: var(--color-surface);
  color: var(--color-text);
}
.note {
  margin-top: var(--space-4);
  color: var(--color-text-faint);
  font-size: var(--text-sm);
}

.how {
  padding: var(--space-8) 0;
}
.how h2,
.closing h2 {
  font-size: var(--text-2xl);
  text-align: center;
  margin-bottom: var(--space-6);
}
.steps {
  list-style: none;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr));
  gap: var(--space-5);
}
.steps h3 {
  font-size: var(--text-lg);
  margin: var(--space-3) 0 var(--space-2);
}
.steps p {
  color: var(--color-text-muted);
  font-size: var(--text-sm);
}
.step-num {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  border-radius: var(--radius-full);
  background: var(--color-surface-raised);
  color: var(--color-accent);
  font-weight: 700;
}

.features {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr));
  gap: var(--space-4);
  padding: var(--space-8) 0;
}
.features h3 {
  font-size: var(--text-lg);
  margin-bottom: var(--space-2);
}
.features p {
  color: var(--color-text-muted);
  font-size: var(--text-sm);
}

.closing {
  text-align: center;
  padding: var(--space-10) 0 0;
}
</style>
