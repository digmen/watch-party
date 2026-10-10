<script setup lang="ts">
import { useHead } from "@unhead/vue";
import { ref } from "vue";
import { useRouter } from "vue-router";
import { API_ORIGIN } from "../api/client";
import { usePageSeo } from "../seo";
import { useAuthStore } from "../stores/auth.store";

const auth = useAuthStore();
const router = useRouter();

const displayName = ref("");
const starting = ref(false);

usePageSeo({
  title: "Watch Party — смотрите фильмы вместе онлайн, даже на расстоянии",
  description:
    "Бесплатный совместный просмотр: вставьте ссылку на видео, отправьте комнату другу — и вы смотрите синхронно, с чатом. Без регистрации и установки.",
  path: "/",
});

const faq = [
  {
    q: "Нужно ли регистрироваться?",
    a: "Нет. Достаточно ввести имя — и комната готова. Друзья заходят по ссылке тоже без регистрации. Аккаунт (почта или Google) нужен только если хотите, чтобы комнаты сохранялись.",
  },
  {
    q: "Что можно смотреть?",
    a: "Прямые ссылки на видеофайлы (.mp4, .m3u8), а также видео с ok.ru и VK Видео. YouTube, Netflix, Кинопоиск и подобные сервисы не поддерживаются: у них закрытые плееры.",
  },
  {
    q: "Как работает синхронизация?",
    a: "Пауза, перемотка и старт у любого участника применяются у всех сразу. Если у кого-то отстаёт интернет, плеер сам подтянет его к общему времени.",
  },
  {
    q: "Сколько человек может смотреть вместе?",
    a: "В одной комнате — до нескольких десятков гостей. Для вечера вдвоём или с компанией друзей этого с запасом.",
  },
  {
    q: "Это бесплатно?",
    a: "Да. Комнаты, приглашения и чат бесплатны.",
  },
];

useHead({
  script: [
    {
      type: "application/ld+json",
      innerHTML: JSON.stringify({
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: faq.map((f) => ({
          "@type": "Question",
          name: f.q,
          acceptedAnswer: { "@type": "Answer", text: f.a },
        })),
      }),
    },
  ],
});

// The no-signup path: a name is the only thing standing between a visitor and a room they can
// share. Signed-in users skip the form and go straight to their rooms.
async function startNow() {
  const name = displayName.value.trim();
  if (!name || starting.value) return;
  starting.value = true;
  try {
    const roomId = await auth.startAsGuest(name);
    router.push(`/rooms/${roomId}`);
  } catch {
    // auth.error holds the message; the template renders it.
  } finally {
    starting.value = false;
  }
}

function scrollTop() {
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function continueWithGoogle() {
  window.location.href = `${API_ORIGIN}/auth/google`;
}
</script>

<template>
  <main id="top" class="landing">
    <section class="hero">
      <p class="pill"><span class="dot"></span> Бесплатно · без регистрации · прямо в браузере</p>
      <h1>Кино на двоих.<br /><span class="grad">Даже когда вы далеко.</span></h1>
      <p class="lede">
        Вставьте ссылку на фильм, отправьте комнату другу — и вы на одной секунде. Пауза у одного
        останавливает у всех, рядом идёт чат.
      </p>

      <div v-if="auth.isAuthenticated && !auth.isGuest" class="cta">
        <RouterLink class="btn" to="/rooms">Мои комнаты</RouterLink>
        <RouterLink class="btn-ghost" to="/rooms/new">Новая комната</RouterLink>
      </div>

      <div v-else-if="auth.isGuest && auth.guestRoomId" class="cta">
        <RouterLink class="btn" :to="`/rooms/${auth.guestRoomId}`">Вернуться в комнату</RouterLink>
      </div>

      <template v-else>
        <form class="start" @submit.prevent="startNow">
          <input
            v-model="displayName"
            type="text"
            maxlength="32"
            required
            placeholder="Ваше имя"
            aria-label="Ваше имя"
          />
          <button type="submit" :disabled="starting || !displayName.trim()">
            {{ starting ? "Создаём…" : "Создать комнату" }}
          </button>
        </form>
        <p v-if="auth.error" class="error start-error" role="alert">{{ auth.error }}</p>
        <p class="note">
          или
          <button type="button" class="linklike" @click="continueWithGoogle">войдите через Google</button>
          — чтобы комнаты сохранялись
        </p>
      </template>

      <div class="screen" aria-hidden="true">
        <div class="screen-main">
          <div class="scene"></div>
          <div class="play">▶</div>
          <div class="bar"><span></span></div>
          <div class="who">
            <b class="a1">А</b><b class="a2">М</b><b class="a3">К</b>
            <em>3 смотрят</em>
          </div>
        </div>
        <div class="screen-chat">
          <p class="m"><i>Аня</i> ты видела эту сцену?</p>
          <p class="m"><i>Макс</i> ааа, сейчас будет 😂</p>
          <p class="m"><i>Кира</i> поставь на паузу, я за чаем</p>
          <p class="sys">Макс поставил на паузу</p>
        </div>
      </div>
    </section>

    <section id="how" class="block">
      <h2>Три шага до совместного вечера</h2>
      <ol class="steps">
        <li>
          <span class="num">1</span>
          <h3>Назовитесь</h3>
          <p>Введите имя и нажмите «Создать комнату». Это всё, никаких паролей.</p>
        </li>
        <li>
          <span class="num">2</span>
          <h3>Вставьте видео</h3>
          <p>Ссылка на файл, ok.ru или VK Видео — сервис подготовит его для всех.</p>
        </li>
        <li>
          <span class="num">3</span>
          <h3>Позовите друзей</h3>
          <p>Отправьте ссылку на комнату. Друзья вводят имя и сразу смотрят с вами.</p>
        </li>
      </ol>
    </section>

    <section class="block">
      <h2>Для кого это</h2>
      <div class="cards">
        <article class="card">
          <h3>Пары на расстоянии</h3>
          <p>Вечер кино «как на одном диване», пока вы в разных городах или странах.</p>
        </article>
        <article class="card">
          <h3>Друзья в разных городах</h3>
          <p>Посмотреть новый сезон вместе и обсудить сразу, а не спустя неделю.</p>
        </article>
        <article class="card">
          <h3>Семья</h3>
          <p>Бабушке не нужно ничего устанавливать: ссылка, имя — и она с вами.</p>
        </article>
      </div>
    </section>

    <section class="block narrow">
      <h2>Вопросы и ответы</h2>
      <details v-for="f in faq" :key="f.q" class="faq">
        <summary>{{ f.q }}</summary>
        <p>{{ f.a }}</p>
      </details>
    </section>

    <section class="closing">
      <h2>Что вы хотели посмотреть вместе?</h2>
      <RouterLink v-if="auth.isAuthenticated" class="btn" to="/rooms">К комнатам</RouterLink>
      <a v-else class="btn" href="#top" @click.prevent="scrollTop">Создать комнату</a>
    </section>
  </main>
</template>

<style scoped>
.landing {
  position: relative;
  max-width: var(--container);
  margin: 0 auto;
  padding: 0 var(--space-4) var(--space-12);
}

.hero {
  position: relative;
  padding: var(--space-10) 0 var(--space-8);
  text-align: center;
}
.hero::before {
  content: "";
  position: absolute;
  top: -4rem;
  left: 50%;
  width: 100vw;
  transform: translateX(-50%);
  height: 38rem;
  z-index: -1;
  background:
    radial-gradient(40% 50% at 30% 0%, rgb(255 107 90 / 0.2), transparent 70%),
    radial-gradient(40% 50% at 75% 10%, rgb(120 90 255 / 0.14), transparent 70%);
  pointer-events: none;
}
.pill {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-1) var(--space-4);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-full);
  background: rgb(22 27 34 / 0.7);
  color: var(--color-text-muted);
  font-size: var(--text-sm);
  margin-bottom: var(--space-5);
}
.dot {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 50%;
  background: var(--color-success);
}
h1 {
  font-size: clamp(2.4rem, 7vw, 4.4rem);
  letter-spacing: -0.03em;
  line-height: 1.05;
  margin-bottom: var(--space-5);
}
.grad {
  background: linear-gradient(90deg, #ff6b5a, #ffa36b);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
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

.start {
  display: flex;
  gap: var(--space-2);
  max-width: 32rem;
  margin: 0 auto;
  padding: var(--space-2);
  border: 1px solid var(--color-border-strong);
  border-radius: calc(var(--radius) + 6px);
  background: var(--color-surface);
  box-shadow: var(--shadow);
}
.start input {
  flex: 1;
  min-width: 0;
  border: none;
  background: transparent;
  font-size: var(--text-base);
}
.start input:focus {
  background: transparent;
}
.start button {
  white-space: nowrap;
}
.start-error {
  margin-top: var(--space-3);
}
.note {
  margin-top: var(--space-4);
  color: var(--color-text-faint);
  font-size: var(--text-sm);
}
.linklike {
  display: inline;
  padding: 0;
  background: none;
  border: none;
  color: var(--color-accent);
  text-decoration: underline;
  cursor: pointer;
  font-weight: 500;
}
.linklike:hover:not(:disabled) {
  background: none;
  color: var(--color-accent-hover);
}

/* Product preview: the real room layout (player + side chat), simplified. */
.screen {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 15rem;
  max-width: 52rem;
  margin: var(--space-8) auto 0;
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  box-shadow: var(--shadow-lg);
  overflow: hidden;
  text-align: left;
}
.screen-main {
  position: relative;
  min-height: 15rem;
  display: grid;
  place-items: center;
  background: #0a0d12;
}
.scene {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(60% 80% at 70% 30%, rgb(255 163 107 / 0.35), transparent 60%),
    linear-gradient(160deg, #1d2536, #0a0d12);
}
.play {
  position: relative;
  width: 3.6rem;
  height: 3.6rem;
  border-radius: 50%;
  display: grid;
  place-items: center;
  padding-left: 4px;
  background: rgb(255 255 255 / 0.14);
  backdrop-filter: blur(6px);
  border: 1px solid rgb(255 255 255 / 0.25);
  color: #fff;
  font-size: var(--text-lg);
}
.bar {
  position: absolute;
  left: var(--space-4);
  right: var(--space-4);
  bottom: var(--space-4);
  height: 4px;
  border-radius: 2px;
  background: rgb(255 255 255 / 0.2);
}
.bar span {
  display: block;
  width: 38%;
  height: 100%;
  border-radius: 2px;
  background: var(--color-accent);
}
.who {
  position: absolute;
  top: var(--space-3);
  left: var(--space-3);
  display: flex;
  align-items: center;
}
.who b {
  width: 1.8rem;
  height: 1.8rem;
  border-radius: 50%;
  display: grid;
  place-items: center;
  margin-right: -6px;
  border: 2px solid #0a0d12;
  font-size: var(--text-xs);
  color: #10141b;
}
.a1 {
  background: #ffa36b;
}
.a2 {
  background: #8fd3ff;
}
.a3 {
  background: #b9f0a8;
}
.who em {
  margin-left: calc(var(--space-2) + 6px);
  font-style: normal;
  font-size: var(--text-xs);
  color: rgb(255 255 255 / 0.75);
}
.screen-chat {
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  gap: var(--space-3);
  padding: var(--space-4);
  border-left: 1px solid var(--color-border);
  font-size: var(--text-sm);
}
.m i {
  font-style: normal;
  font-weight: 600;
  color: var(--color-accent);
  margin-right: var(--space-2);
}
.sys {
  color: var(--color-text-faint);
  font-size: var(--text-xs);
  text-align: center;
}

.block {
  padding: var(--space-10) 0 0;
}
.block h2,
.closing h2 {
  font-size: var(--text-2xl);
  text-align: center;
  margin-bottom: var(--space-6);
}
.narrow {
  max-width: 40rem;
  margin: 0 auto;
}

.steps {
  list-style: none;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr));
  gap: var(--space-4);
}
.steps li {
  padding: var(--space-5);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
}
.steps h3 {
  font-size: var(--text-lg);
  margin: var(--space-3) 0 var(--space-2);
}
.steps p,
.card p {
  color: var(--color-text-muted);
  font-size: var(--text-sm);
}
.num {
  display: inline-grid;
  place-items: center;
  width: 2rem;
  height: 2rem;
  border-radius: var(--radius-full);
  background: rgb(255 107 90 / 0.15);
  color: var(--color-accent);
  font-weight: 700;
}

.cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr));
  gap: var(--space-4);
}
.card h3 {
  font-size: var(--text-lg);
  margin-bottom: var(--space-2);
}

.faq {
  border-bottom: 1px solid var(--color-border);
  padding: var(--space-4) 0;
}
.faq summary {
  cursor: pointer;
  font-weight: 600;
  list-style: none;
  display: flex;
  justify-content: space-between;
  gap: var(--space-4);
}
.faq summary::-webkit-details-marker {
  display: none;
}
.faq summary::after {
  content: "+";
  color: var(--color-accent);
  font-size: var(--text-xl);
  line-height: 1;
}
.faq[open] summary::after {
  content: "–";
}
.faq p {
  margin-top: var(--space-3);
  color: var(--color-text-muted);
}

.closing {
  text-align: center;
  padding: var(--space-12) 0 0;
}

@media (max-width: 40rem) {
  .start {
    flex-direction: column;
  }
  .screen {
    grid-template-columns: minmax(0, 1fr);
  }
  .screen-chat {
    border-left: none;
    border-top: 1px solid var(--color-border);
  }
}
</style>
