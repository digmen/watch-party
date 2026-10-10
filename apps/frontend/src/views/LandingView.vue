<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";
import { API_ORIGIN } from "../api/client";
import { usePageSeo } from "../seo";
import { useAuthStore } from "../stores/auth.store";

const auth = useAuthStore();
const router = useRouter();

const displayName = ref("");
const starting = ref(false);

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

usePageSeo({
  title: "Watch Party — смотрите видео вместе с друзьями онлайн",
  description:
    "Совместный просмотр видео в реальном времени: создайте комнату, отправьте ссылку другу и смотрите синхронно — пауза и перемотка у всех сразу, рядом чат. Друзьям регистрация не нужна.",
  path: "/",
});
</script>

<template>
  <main id="top" class="landing">
    <section class="hero">
      <p class="eyebrow">Совместный просмотр</p>
      <h1>Смотрите вместе,<br />даже если вы в разных городах</h1>
      <p class="lede">
        Отправьте другу ссылку — и вы окажетесь на одной секунде фильма. Пауза у одного
        останавливает у всех, перемотка синхронна, рядом идёт чат.
      </p>

      <div v-if="auth.isAuthenticated && !auth.isGuest" class="cta">
        <RouterLink class="btn" to="/rooms">Мои комнаты</RouterLink>
        <a class="btn-ghost" href="#how">Как это работает</a>
      </div>

      <div v-else-if="auth.isGuest && auth.guestRoomId" class="cta">
        <RouterLink class="btn" :to="`/rooms/${auth.guestRoomId}`">Вернуться в комнату</RouterLink>
      </div>

      <form v-else class="start" @submit.prevent="startNow">
        <input
          v-model="displayName"
          type="text"
          maxlength="32"
          required
          placeholder="Как вас зовут?"
          aria-label="Ваше имя"
        />
        <button type="submit" :disabled="starting || !displayName.trim()">
          {{ starting ? "Создаём…" : "Смотреть сразу" }}
        </button>
      </form>
      <p v-if="auth.error" class="error start-error" role="alert">{{ auth.error }}</p>

      <p v-if="!auth.isAuthenticated" class="note">
        Бесплатно и без регистрации. Или
        <button type="button" class="linklike" @click="continueWithGoogle">войдите через Google</button>,
        чтобы сохранять комнаты.
      </p>
      <p v-else class="note">Друзьям регистрация не нужна — достаточно ввести имя.</p>

      <div class="screen" aria-hidden="true">
        <div class="screen-bar"><i></i><i></i><i></i></div>
        <div class="screen-body">
          <div class="play">▶</div>
          <div class="seek"><span></span></div>
          <div class="avatars"><b>А</b><b>М</b><b>К</b><em>3 смотрят</em></div>
        </div>
      </div>
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
      <RouterLink v-if="auth.isAuthenticated" class="btn" to="/rooms">К комнатам</RouterLink>
      <a v-else class="btn" href="#top" @click.prevent="scrollTop">Начать сейчас</a>
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
.landing {
  position: relative;
}
.hero::before {
  content: "";
  position: absolute;
  inset: 0 0 auto 0;
  height: 32rem;
  z-index: -1;
  background: radial-gradient(60% 60% at 50% 0%, rgb(255 107 90 / 0.18), transparent 70%);
  pointer-events: none;
}
.start {
  display: flex;
  gap: var(--space-3);
  max-width: 30rem;
  margin: 0 auto;
}
.start input {
  flex: 1;
  min-width: 0;
}
.start button {
  white-space: nowrap;
}
.start-error {
  margin-top: var(--space-3);
}
.linklike {
  display: inline;
  padding: 0;
  background: none;
  border: none;
  color: var(--color-accent);
  text-decoration: underline;
  cursor: pointer;
}
.screen {
  max-width: 40rem;
  margin: var(--space-8) auto 0;
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  box-shadow: var(--shadow-lg);
  overflow: hidden;
  text-align: left;
}
.screen-bar {
  display: flex;
  gap: 6px;
  padding: var(--space-3) var(--space-4);
  border-bottom: 1px solid var(--color-border);
}
.screen-bar i {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--color-border-strong);
}
.screen-body {
  position: relative;
  aspect-ratio: 16 / 8;
  display: grid;
  place-items: center;
  background: linear-gradient(135deg, #1b2230, #10141b);
}
.play {
  width: 4rem;
  height: 4rem;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: var(--color-accent);
  color: var(--color-accent-contrast);
  font-size: var(--text-xl);
  padding-left: 4px;
}
.seek {
  position: absolute;
  left: var(--space-5);
  right: var(--space-5);
  bottom: var(--space-5);
  height: 4px;
  border-radius: 2px;
  background: var(--color-border-strong);
}
.seek span {
  display: block;
  width: 42%;
  height: 100%;
  border-radius: 2px;
  background: var(--color-accent);
}
.avatars {
  position: absolute;
  top: var(--space-4);
  right: var(--space-4);
  display: flex;
  align-items: center;
}
.avatars b {
  width: 1.9rem;
  height: 1.9rem;
  border-radius: 50%;
  display: grid;
  place-items: center;
  margin-left: -6px;
  background: var(--color-surface-raised);
  border: 2px solid var(--color-surface);
  font-size: var(--text-xs);
}
.avatars em {
  margin-left: var(--space-3);
  font-style: normal;
  font-size: var(--text-xs);
  color: var(--color-text-muted);
}
@media (max-width: 480px) {
  .start {
    flex-direction: column;
  }
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
