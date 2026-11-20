<script setup lang="ts">
import { useHead } from "@unhead/vue";
import type { PublicRoomDto } from "@watch-party/shared";
import { onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { API_ORIGIN } from "../api/client";
import { roomsApi } from "../api/rooms.api";
import HeroRoomMock from "../components/landing/HeroRoomMock.vue";
import LandingFaq from "../components/landing/LandingFaq.vue";
import PublicRoomList from "../components/PublicRoomList.vue";
import { usePageSeo } from "../seo";
import { useAuthStore } from "../stores/auth.store";

const auth = useAuthStore();
const router = useRouter();

const publicRooms = ref<PublicRoomDto[]>([]);
const publicLoaded = ref(false);
onMounted(async () => {
  if (auth.isGuest && auth.user) displayName.value = auth.user.displayName;
  try {
    publicRooms.value = (await roomsApi.publicList(10)).rooms;
  } catch {
    // The list is a bonus; the landing page works without it.
  } finally {
    publicLoaded.value = true;
  }
});

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
    a: "YouTube, Twitch (в том числе прямые эфиры), TikTok, VK Видео, ok.ru, Rutube, Dailymotion и прямые ссылки на видеофайлы (.mp4, .m3u8). Страницы онлайн-кинотеатров и платные сервисы вроде Netflix не поддерживаются.",
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

// Static copy for the sections below. Kept here so the template reads as layout, not as text.
const facts = [
  { value: "0 ₽", label: "комнаты и чат" },
  { value: "1", label: "ссылка, чтобы позвать" },
  { value: "0", label: "установок — всё в браузере" },
];

const steps = [
  { title: "Назовитесь", text: "Введите имя и нажмите «Создать комнату». Это всё, никаких паролей." },
  { title: "Вставьте видео", text: "Ссылка на YouTube, Twitch, TikTok, VK или файл — сервис подготовит её для всех." },
  { title: "Позовите друзей", text: "Отправьте ссылку на комнату. Друзья вводят имя и сразу смотрят с вами." },
];

const sources = ["YouTube", "Twitch", "TikTok", "VK Видео", "ok.ru", "Rutube", "Dailymotion", ".mp4", ".m3u8"];

const audiences = [
  { icon: "💞", title: "Пары на расстоянии", text: "Вечер кино «как на одном диване», пока вы в разных городах или странах." },
  { icon: "🍿", title: "Друзья в разных городах", text: "Посмотреть новый сезон вместе и обсудить сразу, а не спустя неделю." },
  { icon: "🏡", title: "Семья", text: "Бабушке не нужно ничего устанавливать: ссылка, имя — и она с вами." },
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
    <!-- Hero -->
    <section class="hero">
      <div class="hero-glow" aria-hidden="true"></div>
      <div class="container hero-grid">
        <div class="hero-copy">
          <p class="pill"><span class="dot"></span> Бесплатно · без регистрации · прямо в браузере</p>
          <h1>Кино на двоих. <span class="grad">Даже когда вы далеко.</span></h1>
          <p class="lede">
            Вставьте ссылку на видео или трансляцию, отправьте комнату другу — и вы на одной секунде. Пауза у одного
            останавливает у всех, рядом идёт чат.
          </p>

          <div v-if="auth.isAuthenticated && !auth.isGuest" class="cta">
            <RouterLink class="btn" to="/rooms">Мои комнаты</RouterLink>
            <RouterLink class="btn ghost" to="/rooms/new">Новая комната</RouterLink>
          </div>

          <template v-else>
            <form class="start" @submit.prevent="startNow">
              <label class="visually-hidden" for="landing-name">Ваше имя</label>
              <input
                id="landing-name"
                v-model="displayName"
                data-testid="landing-name"
                type="text"
                maxlength="32"
                required
                placeholder="Ваше имя"
                autocomplete="nickname"
              />
              <button type="submit" data-testid="landing-start" :disabled="starting || !displayName.trim()">
                {{ starting ? "Создаём…" : "Создать комнату" }}
              </button>
            </form>
            <p v-if="auth.error" class="error start-error" role="alert">{{ auth.error }}</p>
            <div class="notes">
              <RouterLink v-if="auth.isGuest" class="note-link" to="/rooms">Мои комнаты →</RouterLink>
              <p class="note">
                или
                <button type="button" class="linklike" @click="continueWithGoogle">войдите через Google</button>
                — чтобы комнаты сохранялись
              </p>
            </div>
          </template>
        </div>

        <HeroRoomMock class="hero-mock" />
      </div>

      <ul class="container facts" aria-label="Коротко">
        <li v-for="f in facts" :key="f.label">
          <b>{{ f.value }}</b>
          <span>{{ f.label }}</span>
        </li>
      </ul>
    </section>

    <!-- Live public rooms -->
    <section class="container block live" aria-live="polite">
      <div class="section-head row">
        <div>
          <p class="eyebrow">Прямо сейчас</p>
          <h2>Сейчас в публичных комнатах</h2>
        </div>
        <RouterLink class="more" to="/public">Все комнаты →</RouterLink>
      </div>
      <!-- The section keeps one height in all three states, so the page does not jump when the list arrives. -->
      <div class="live-body">
        <PublicRoomList v-if="publicRooms.length > 0" :rooms="publicRooms" />
        <p v-else-if="publicLoaded" class="live-empty">Пока нет публичных комнат — создайте первую и сделайте её открытой.</p>
        <div v-else class="live-skeleton" aria-hidden="true"><span></span><span></span><span></span></div>
      </div>
    </section>

    <!-- How it works -->
    <section id="how" class="container block">
      <div class="section-head">
        <p class="eyebrow">Как это работает</p>
        <h2>Три шага до совместного вечера</h2>
      </div>
      <ol class="steps">
        <li v-for="(s, i) in steps" :key="s.title">
          <span class="num">{{ String(i + 1).padStart(2, "0") }}</span>
          <h3>{{ s.title }}</h3>
          <p>{{ s.text }}</p>
        </li>
      </ol>
    </section>

    <!-- Features -->
    <section class="container block">
      <div class="section-head">
        <p class="eyebrow">Что внутри</p>
        <h2>Всё, чтобы смотреть вместе, а не «три, два, один — жми»</h2>
      </div>
      <div class="bento">
        <article class="tile tile-sync">
          <div class="sync-viz" aria-hidden="true">
            <div v-for="n in 3" :key="n" class="sync-row">
              <b :class="`t${n}`">{{ ["А", "М", "К"][n - 1] }}</b>
              <span class="sync-bar"><span></span></span>
              <em>42:17</em>
            </div>
          </div>
          <h3>Все на одной секунде</h3>
          <p>
            Пауза, перемотка и старт у любого участника применяются у всех сразу. Если у кого-то отстаёт интернет, плеер
            сам подтянет его к общему времени.
          </p>
        </article>

        <article class="tile">
          <span class="ico" aria-hidden="true">
            <svg viewBox="0 0 24 24"><path d="M4 5h16v11H8l-4 4z" /></svg>
          </span>
          <h3>Чат рядом с видео</h3>
          <p>Реакции и шутки видны всем сразу. Историю сообщений увидит и тот, кто зашёл позже.</p>
        </article>

        <article class="tile">
          <span class="ico" aria-hidden="true">
            <svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 4-6 8-6s8 2 8 6" /></svg>
          </span>
          <h3>Без регистрации</h3>
          <p>Достаточно имени — и вам, и друзьям. Аккаунт нужен, только чтобы комнаты сохранялись.</p>
        </article>

        <article class="tile tile-sources">
          <span class="ico" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <path d="M10 14a4 4 0 0 0 6 0l3-3a4 4 0 0 0-6-6l-1 1" />
              <path d="M14 10a4 4 0 0 0-6 0l-3 3a4 4 0 0 0 6 6l1-1" />
            </svg>
          </span>
          <h3>Ссылка — и смотрим</h3>
          <p>Видео, прямые эфиры и файлы по прямой ссылке.</p>
          <ul class="chips">
            <li v-for="s in sources" :key="s">{{ s }}</li>
          </ul>
        </article>

        <article class="tile">
          <span class="ico" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <circle cx="9" cy="9" r="3.5" />
              <circle cx="17" cy="10" r="2.5" />
              <path d="M2.5 20c0-3.5 3-5.5 6.5-5.5s6.5 2 6.5 5.5M15.5 15c3 0 6 1.5 6 4.5" />
            </svg>
          </span>
          <h3>Хоть вдвоём, хоть компанией</h3>
          <p>В одной комнате — до нескольких десятков гостей.</p>
        </article>

        <article class="tile">
          <span class="ico" aria-hidden="true">
            <svg viewBox="0 0 24 24"><path d="M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.4 6.7 19.4l1.2-6L3.4 9.3l6-.7z" /></svg>
          </span>
          <h3>Бесплатно</h3>
          <p>Комнаты, приглашения и чат ничего не стоят.</p>
        </article>
      </div>
    </section>

    <!-- Audiences -->
    <section class="container block">
      <div class="section-head">
        <p class="eyebrow">Для кого это</p>
        <h2>Для тех, кто далеко, но хочет рядом</h2>
      </div>
      <div class="audiences">
        <article v-for="a in audiences" :key="a.title" class="audience">
          <span class="emoji" aria-hidden="true">{{ a.icon }}</span>
          <h3>{{ a.title }}</h3>
          <p>{{ a.text }}</p>
        </article>
      </div>
    </section>

    <!-- FAQ -->
    <section class="container block faq-block">
      <div class="section-head faq-head">
        <p class="eyebrow">FAQ</p>
        <h2>Вопросы и ответы</h2>
        <p class="muted">Не нашли ответ — загляните на страницу <RouterLink to="/about">о проекте</RouterLink>.</p>
      </div>
      <LandingFaq :items="faq" />
    </section>

    <!-- Closing CTA -->
    <section class="container closing-wrap">
      <div class="closing">
        <div class="closing-glow" aria-hidden="true"></div>
        <h2>Что вы хотели посмотреть вместе?</h2>
        <p class="muted">Нужно только имя. Ссылку — другу, и начинаем.</p>
        <RouterLink v-if="auth.isAuthenticated" class="btn big" to="/rooms">К комнатам</RouterLink>
        <a v-else class="btn big" href="#top" @click.prevent="scrollTop">Создать комнату</a>
      </div>
    </section>
  </main>
</template>

<style scoped>
.landing {
  position: relative;
  padding-bottom: var(--space-12);
}

/* --- Hero ------------------------------------------------------------------ */

.hero {
  position: relative;
  padding: var(--space-8) 0 var(--space-6);
  isolation: isolate;
}
.hero-glow {
  position: absolute;
  inset: -4rem 0 auto;
  height: 44rem;
  z-index: -1;
  pointer-events: none;
  background:
    radial-gradient(38% 40% at 18% 8%, rgb(255 181 71 / 0.16), transparent 70%),
    radial-gradient(40% 45% at 85% 25%, color-mix(in srgb, var(--color-glow) 22%, transparent), transparent 70%);
}
/* Faint film-strip grid, fades out downwards. */
.hero-glow::after {
  content: "";
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(var(--color-border) 1px, transparent 1px),
    linear-gradient(90deg, var(--color-border) 1px, transparent 1px);
  background-size: 56px 56px;
  opacity: 0.35;
  mask-image: radial-gradient(60% 55% at 50% 20%, #000, transparent 75%);
}

.hero-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--space-8);
  align-items: center;
}
.hero-copy {
  text-align: center;
}

.pill {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  max-width: 100%;
  padding: var(--space-1) var(--space-3);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-full);
  background: rgb(17 17 22 / 0.7);
  color: var(--color-text-muted);
  font-size: var(--text-xs);
  font-weight: 600;
  margin-bottom: var(--space-5);
}
.dot {
  flex: none;
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 50%;
  background: var(--color-success);
  box-shadow: 0 0 10px var(--color-success);
}

h1 {
  font-size: var(--text-hero);
  line-height: 1.04;
  letter-spacing: -0.035em;
  margin-bottom: var(--space-5);
}
.grad {
  display: block;
  background: linear-gradient(90deg, var(--color-accent), #ffd99a 55%, color-mix(in srgb, var(--color-glow) 60%, #ffd99a));
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

.start {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  max-width: 30rem;
  margin: 0 auto;
  padding: var(--space-2);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-xl);
  background: rgb(17 17 22 / 0.85);
  box-shadow: var(--shadow);
  transition:
    border-color var(--transition),
    box-shadow var(--transition);
}
.start:focus-within {
  border-color: var(--color-accent-line);
  box-shadow:
    var(--shadow),
    0 0 0 4px var(--color-accent-soft);
}
.start input {
  flex: 1;
  min-width: 0;
  border: none;
  background: transparent;
  border-radius: var(--radius-full);
  padding-inline: var(--space-4);
}
.start input:focus {
  background: transparent;
  box-shadow: none;
}
.start button {
  min-height: 3rem;
}
.start-error {
  margin-top: var(--space-3);
}
.notes {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-1);
  margin-top: var(--space-3);
}
.note,
.note-link {
  font-size: var(--text-sm);
}
.note {
  color: var(--color-text-faint);
}
.note-link {
  display: inline-flex;
  align-items: center;
  min-height: 2.75rem;
  font-weight: 700;
  text-decoration: none;
}
.linklike {
  display: inline-flex;
  min-height: 2.75rem;
  padding: 0 var(--space-1);
  background: none;
  border: none;
  color: var(--color-accent);
  text-decoration: underline;
  text-decoration-color: var(--color-accent-line);
  text-underline-offset: 0.2em;
  font-weight: 600;
  white-space: normal;
  vertical-align: middle;
}
.linklike:hover:not(:disabled) {
  background: none;
  box-shadow: none;
  color: var(--color-accent-hover);
}

.facts {
  list-style: none;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-2);
  margin-top: var(--space-8);
}
.facts li {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-3) var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  background: rgb(17 17 22 / 0.6);
  text-align: center;
}
.facts b {
  font-family: var(--font-display);
  font-size: var(--text-xl);
  font-weight: 600;
  color: var(--color-accent);
  line-height: 1.1;
}
.facts span {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  line-height: 1.3;
}

/* --- Sections -------------------------------------------------------------- */

.block {
  padding-top: var(--space-12);
}
.section-head {
  max-width: 40rem;
  margin: 0 auto var(--space-6);
  text-align: center;
}
.section-head .eyebrow {
  margin-bottom: var(--space-2);
}
.section-head h2 {
  font-size: var(--text-3xl);
}
.section-head.row {
  max-width: none;
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--space-3) var(--space-5);
  text-align: left;
}
.section-head.row h2 {
  font-size: var(--text-2xl);
}
.more {
  display: inline-flex;
  align-items: center;
  min-height: 2.75rem;
  font-weight: 700;
  font-size: var(--text-sm);
  text-decoration: none;
}

.live-body {
  min-height: 7.5rem;
}
.live-empty {
  display: grid;
  place-items: center;
  min-height: 7.5rem;
  padding: var(--space-5);
  border: 1px dashed var(--color-border-strong);
  border-radius: var(--radius-lg);
  color: var(--color-text-muted);
  font-size: var(--text-sm);
  text-align: center;
}
.live-skeleton {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(17rem, 100%), 1fr));
  gap: var(--space-4);
}
.live-skeleton span {
  height: 7.5rem;
  border-radius: var(--radius-lg);
  background: linear-gradient(90deg, var(--color-surface), var(--color-surface-raised), var(--color-surface));
  background-size: 200% 100%;
  animation: shimmer 1.4s ease-in-out infinite;
}
@keyframes shimmer {
  to {
    background-position: -200% 0;
  }
}

/* Steps */
.steps {
  list-style: none;
  padding: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--space-4);
  counter-reset: none;
}
.steps li {
  position: relative;
  padding: var(--space-5);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: linear-gradient(180deg, var(--color-surface-raised), var(--color-surface));
  overflow: hidden;
}
.num {
  display: block;
  font-family: var(--font-display);
  font-size: 2.6rem;
  font-weight: 700;
  line-height: 1;
  letter-spacing: -0.04em;
  background: linear-gradient(180deg, var(--color-accent), rgb(255 181 71 / 0.15));
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
.steps h3 {
  font-size: var(--text-lg);
  margin: var(--space-4) 0 var(--space-2);
}
.steps p,
.tile p,
.audience p {
  color: var(--color-text-muted);
  font-size: var(--text-sm);
}

/* Features bento */
.bento {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--space-4);
}
.tile {
  position: relative;
  padding: var(--space-5);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  overflow: hidden;
  transition: border-color var(--transition);
}
.tile:hover {
  border-color: var(--color-border-strong);
}
.tile h3 {
  font-size: var(--text-lg);
  margin-bottom: var(--space-2);
}
.ico {
  display: grid;
  place-items: center;
  width: 2.75rem;
  height: 2.75rem;
  margin-bottom: var(--space-4);
  border-radius: var(--radius);
  background: var(--color-accent-soft);
  color: var(--color-accent);
}
.ico svg {
  width: 1.3rem;
  height: 1.3rem;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.tile-sync {
  background:
    radial-gradient(70% 60% at 100% 0%, rgb(255 181 71 / 0.12), transparent 70%),
    radial-gradient(60% 60% at 0% 100%, color-mix(in srgb, var(--color-glow) 14%, transparent), transparent 70%),
    var(--color-surface);
  border-color: var(--color-accent-line);
}
.sync-viz {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  margin-bottom: var(--space-5);
  padding: var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  background: rgb(8 8 11 / 0.6);
}
.sync-row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}
.sync-row b {
  display: grid;
  place-items: center;
  flex: none;
  width: 1.75rem;
  height: 1.75rem;
  border-radius: 50%;
  font-size: 0.72rem;
  font-weight: 800;
  color: var(--color-accent-contrast);
}
.t1 {
  background: var(--color-accent);
}
.t2 {
  background: #b9a6ff;
}
.t3 {
  background: #8be0b4;
}
.sync-bar {
  flex: 1;
  height: 4px;
  border-radius: 2px;
  background: var(--color-border-strong);
}
.sync-bar span {
  display: block;
  width: 58%;
  height: 100%;
  border-radius: 2px;
  background: var(--color-accent);
  box-shadow: 0 0 10px rgb(255 181 71 / 0.5);
}
.sync-row em {
  font-style: normal;
  font-size: var(--text-xs);
  font-weight: 700;
  color: var(--color-text-muted);
}

.chips {
  list-style: none;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin-top: var(--space-4);
}
.chips li {
  padding: var(--space-1) var(--space-3);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-full);
  background: var(--color-surface-raised);
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--color-text);
}

/* Audiences */
.audiences {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--space-4);
}
.audience {
  padding: var(--space-5);
  border-radius: var(--radius-lg);
  border: 1px solid var(--color-border);
  background: var(--color-surface);
}
.emoji {
  display: block;
  font-size: 1.8rem;
  line-height: 1;
  margin-bottom: var(--space-4);
}
.audience h3 {
  font-size: var(--text-lg);
  margin-bottom: var(--space-2);
}

/* FAQ */
.faq-head .muted {
  margin-top: var(--space-3);
  font-size: var(--text-sm);
}

/* Closing */
.closing-wrap {
  padding-top: var(--space-12);
}
.closing {
  position: relative;
  isolation: isolate;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-4);
  padding: var(--space-10) var(--space-5);
  border: 1px solid var(--color-accent-line);
  border-radius: var(--radius-xl);
  background: var(--color-surface);
  text-align: center;
  overflow: hidden;
}
.closing-glow {
  position: absolute;
  inset: 0;
  z-index: -1;
  background:
    radial-gradient(60% 80% at 50% 0%, rgb(255 181 71 / 0.22), transparent 70%),
    radial-gradient(50% 70% at 100% 100%, color-mix(in srgb, var(--color-glow) 22%, transparent), transparent 70%);
}
.closing h2 {
  font-size: var(--text-3xl);
  max-width: 30rem;
}
.closing .muted {
  max-width: 28rem;
}
.btn.big {
  min-height: 3.25rem;
  padding-inline: var(--space-6);
  margin-top: var(--space-2);
  font-size: var(--text-lg);
}

/* --- Breakpoints ------------------------------------------------------------ */

@media (min-width: 30rem) {
  .start {
    flex-direction: row;
    border-radius: var(--radius-full);
  }
  .notes {
    flex-direction: row;
    flex-wrap: wrap;
    justify-content: center;
    column-gap: var(--space-4);
  }
}

@media (min-width: 40rem) {
  .steps,
  .audiences {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  .bento {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .tile-sync,
  .tile-sources {
    grid-column: span 2;
  }
  .facts {
    gap: var(--space-4);
  }
  .facts li {
    padding: var(--space-4);
  }
  .facts span {
    font-size: var(--text-sm);
  }
}

@media (min-width: 64rem) {
  .hero {
    padding-top: var(--space-12);
  }
  .hero-grid {
    grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr);
    gap: var(--space-8);
  }
  h1 {
    font-size: clamp(2.4rem, 3.9vw, 3.5rem);
  }
  .hero-copy {
    text-align: left;
  }
  .lede {
    margin-inline: 0;
  }
  .start {
    margin-inline: 0;
  }
  .cta {
    justify-content: flex-start;
  }
  .notes {
    justify-content: flex-start;
  }
  .bento {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  .tile-sync {
    grid-column: span 2;
    grid-row: span 2;
    display: flex;
    flex-direction: column;
    justify-content: center;
  }
  .tile-sources {
    grid-column: span 1;
  }
  .faq-block {
    display: grid;
    grid-template-columns: minmax(0, 0.8fr) minmax(0, 1.2fr);
    gap: var(--space-10);
    align-items: start;
  }
  .faq-head {
    position: sticky;
    top: calc(var(--header-h) + var(--space-6));
    margin: 0;
    text-align: left;
  }
}
</style>
