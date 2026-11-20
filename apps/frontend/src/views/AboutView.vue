<script setup lang="ts">
import { usePageSeo } from "../seo";
import { useAuthStore } from "../stores/auth.store";

const auth = useAuthStore();

usePageSeo({
  title: "О сервисе — Watch Party",
  description:
    "Watch Party — бесплатный совместный просмотр видео для тех, кто далеко друг от друга: комнаты, общий плеер и чат.",
  path: "/about",
});

const pillars = [
  {
    title: "Все на одной секунде",
    text: "Пауза, перемотка и старт применяются у всех сразу. Если у кого-то подвис интернет, плеер сам плавно подтянет его к общему времени.",
  },
  {
    title: "Без «подожди, догоняю»",
    text: "Видео готовится на сервере один раз, поэтому второй, третий и десятый зритель получают его так же быстро, как первый.",
  },
  {
    title: "Чат рядом с видео",
    text: "Реакции и шутки видны всем сразу. Историю сообщений увидит и тот, кто зашёл позже.",
  },
];
</script>

<template>
  <main class="about">
    <section class="hero">
      <div class="glow" aria-hidden="true"></div>
      <div class="container hero-inner">
        <p class="eyebrow">Наша миссия</p>
        <h1>Расстояние — не повод смотреть <span class="grad">порознь</span></h1>
        <p class="lede">
          Когда важные люди оказываются в разных городах или странах, вечер кино вдвоём обычно превращается в «три, два,
          один — жми» и всё равно расходится на пару секунд. Watch Party существует, чтобы это ощущалось так, будто вы на
          одном диване — даже когда между вами тысячи километров.
        </p>
      </div>
    </section>

    <section class="container block">
      <div class="head">
        <p class="eyebrow">Как это устроено</p>
        <h2>Три вещи, ради которых всё сделано</h2>
      </div>
      <div class="grid">
        <article v-for="(p, i) in pillars" :key="p.title" class="pillar">
          <span class="num">{{ String(i + 1).padStart(2, "0") }}</span>
          <h3>{{ p.title }}</h3>
          <p>{{ p.text }}</p>
        </article>
      </div>
    </section>

    <section class="container block split">
      <article class="panel panel-accent">
        <p class="eyebrow">Условия</p>
        <h2>Бесплатно и без регистрации</h2>
        <p>
          Создавать комнаты, звать друзей и смотреть вместе можно бесплатно. Для гостей достаточно ввести имя. Аккаунт
          (почта или Google) нужен только чтобы комнаты сохранялись.
        </p>
      </article>
      <article class="panel">
        <p class="eyebrow">Что можно смотреть</p>
        <h2>Ваша ссылка — ваше видео</h2>
        <p>
          YouTube, VK Видео, ok.ru, Rutube, Twitch, TikTok, а также прямые ссылки на видеофайлы, HLS- и
          DASH-потоки. Сервис не хранит видео: воспроизводится только та ссылка, которую вы указали. Платные
          стриминги с защитой вроде Netflix не поддерживаются.
        </p>
      </article>
    </section>

    <section class="container block">
      <div class="closing">
        <h2>Позовите того, с кем давно собирались что-нибудь посмотреть</h2>
        <RouterLink class="btn big" :to="auth.isAuthenticated ? '/rooms' : '/'">Создать комнату</RouterLink>
      </div>
    </section>
  </main>
</template>

<style scoped>
.about {
  padding-bottom: var(--space-12);
}

.hero {
  position: relative;
  isolation: isolate;
  padding: var(--space-10) 0 var(--space-4);
  text-align: center;
}
.glow {
  position: absolute;
  inset: -4rem 0 auto;
  height: 32rem;
  z-index: -1;
  pointer-events: none;
  background:
    radial-gradient(35% 45% at 30% 10%, rgb(255 181 71 / 0.16), transparent 70%),
    radial-gradient(35% 45% at 75% 20%, color-mix(in srgb, var(--color-glow) 20%, transparent), transparent 70%);
}
.hero-inner {
  max-width: 50rem;
}
.hero .eyebrow {
  margin-bottom: var(--space-4);
}
h1 {
  font-size: var(--text-hero);
  line-height: 1.05;
  letter-spacing: -0.035em;
  margin-bottom: var(--space-5);
}
.grad {
  background: linear-gradient(90deg, var(--color-accent), #ffd99a);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
.lede {
  max-width: 38rem;
  margin: 0 auto;
  font-size: var(--text-lg);
  color: var(--color-text-muted);
}

.block {
  padding-top: var(--space-10);
}
.head {
  text-align: center;
  margin-bottom: var(--space-6);
}
.head .eyebrow {
  margin-bottom: var(--space-2);
}
.head h2 {
  font-size: var(--text-3xl);
}

.grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--space-4);
}
.pillar {
  padding: var(--space-5);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: linear-gradient(180deg, var(--color-surface-raised), var(--color-surface));
}
.num {
  display: block;
  font-family: var(--font-display);
  font-size: 2.4rem;
  font-weight: 700;
  line-height: 1;
  letter-spacing: -0.04em;
  background: linear-gradient(180deg, var(--color-accent), rgb(255 181 71 / 0.15));
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
.pillar h3 {
  font-size: var(--text-lg);
  margin: var(--space-4) 0 var(--space-2);
}
.pillar p,
.panel p:not(.eyebrow) {
  color: var(--color-text-muted);
  font-size: var(--text-sm);
}

.split {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--space-4);
}
.panel {
  padding: var(--space-6) var(--space-5);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-xl);
  background: var(--color-surface);
}
.panel-accent {
  border-color: var(--color-accent-line);
  background:
    radial-gradient(80% 80% at 100% 0%, rgb(255 181 71 / 0.12), transparent 70%),
    var(--color-surface);
}
.panel .eyebrow {
  margin-bottom: var(--space-2);
}
.panel h2 {
  font-size: var(--text-xl);
  margin-bottom: var(--space-3);
}

.closing {
  position: relative;
  isolation: isolate;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-5);
  padding: var(--space-10) var(--space-5);
  border: 1px solid var(--color-accent-line);
  border-radius: var(--radius-xl);
  background:
    radial-gradient(60% 80% at 50% 0%, rgb(255 181 71 / 0.2), transparent 70%),
    radial-gradient(50% 70% at 100% 100%, color-mix(in srgb, var(--color-glow) 20%, transparent), transparent 70%),
    var(--color-surface);
  text-align: center;
}
.closing h2 {
  max-width: 32rem;
  font-size: var(--text-2xl);
}
.btn.big {
  min-height: 3.25rem;
  padding-inline: var(--space-6);
  font-size: var(--text-lg);
}

@media (min-width: 40rem) {
  .grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  .split {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .panel {
    padding: var(--space-8) var(--space-6);
  }
}

@media (min-width: 64rem) {
  .hero {
    padding-top: var(--space-12);
  }
}
</style>
