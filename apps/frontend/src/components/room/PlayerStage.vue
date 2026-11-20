<script setup lang="ts">
import type { ChatMessageDto } from "@watch-party/shared";
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import VideoPlayer from "../VideoPlayer.vue";

const props = defineProps<{
  src: string;
  assetId: string;
  playing: boolean;
  positionSec: number;
  waitingFor: string[];
  title: string | null;
  recent: ChatMessageDto[];
  selfId?: string | null;
  // Chat over the picture outside fullscreen too — the phone-landscape layout has no room for a side panel.
  overlayChat?: boolean;
}>();
const emit = defineEmits<{
  toggle: [];
  seek: [sec: number];
  stall: [stalled: boolean];
  send: [text: string];
  ready: [assetId: string];
  ended: [];
}>();

const stage = ref<HTMLElement | null>(null);
const video = ref<InstanceType<typeof VideoPlayer> | null>(null);
const durationSec = ref(0);
const volume = ref(1);
const muted = ref(false);
const dragSec = ref<number | null>(null);
const unsupported = ref(false);
// The first seconds are not on the device yet: nobody can start the film (and the room is told, so a
// hand-over to the next video can wait for everybody).
const bufferReady = ref(false);
const gated = computed(() => !bufferReady.value && !props.playing);
function onReady(ready: boolean) {
  bufferReady.value = ready;
  if (ready) emit("ready", props.assetId);
}
function requestToggle() {
  if (gated.value) return;
  emit("toggle");
}

// Controls live on top of the picture and fade out while playing, like every real player.
const controlsVisible = ref(true);
let hideTimer: ReturnType<typeof setTimeout> | null = null;
function wake() {
  controlsVisible.value = true;
  if (hideTimer) clearTimeout(hideTimer);
  hideTimer = setTimeout(() => {
    if (props.playing && !chatOpen.value) controlsVisible.value = false;
  }, 2800);
}

// Fullscreen: the real API (with the webkit prefix for older Safari/iPad) on the whole stage, so our
// controls and chat stay on top. iPhone Safari can only fullscreen a bare <video>, which would drop
// both — there a fixed-position "theatre" mode fills the screen instead.
type WebkitDocument = Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => Promise<void> };
type WebkitElement = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };
const fullscreen = ref(false);
const pseudoFullscreen = ref(false);
const chatOpen = ref(false);
const chatDraft = ref("");
const chatInput = ref<HTMLInputElement | null>(null);

function fullscreenElement(): Element | null {
  const doc = document as WebkitDocument;
  return document.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
}

function onFsChange() {
  fullscreen.value = fullscreenElement() === stage.value;
  if (!fullscreen.value && !props.overlayChat) chatOpen.value = false;
}

async function toggleFullscreen() {
  const el = stage.value as WebkitElement | null;
  if (!el) return;
  if (fullscreen.value || pseudoFullscreen.value) {
    const doc = document as WebkitDocument;
    if (document.fullscreenElement) await document.exitFullscreen().catch(() => {});
    else if (doc.webkitFullscreenElement) await doc.webkitExitFullscreen?.();
    pseudoFullscreen.value = false;
    fullscreen.value = false;
    chatOpen.value = false;
    return;
  }
  try {
    if (el.requestFullscreen) {
      await el.requestFullscreen();
      return;
    }
    if (el.webkitRequestFullscreen) {
      await el.webkitRequestFullscreen();
      return;
    }
  } catch {
    // fall through to the pseudo mode
  }
  pseudoFullscreen.value = true;
}

const inFullscreen = computed(() => fullscreen.value || pseudoFullscreen.value);
const showOverlay = computed(() => inFullscreen.value || props.overlayChat === true);

// --- chat over the picture ----------------------------------------------------------------
// Fresh messages float in the bottom-left corner for a few seconds and fade; the 💬 button opens a
// panel with the recent history and an input, so nobody has to leave fullscreen to answer.
const FLOAT_MS = 6000;
const seenAt = new Map<string, number>();
const now = ref(Date.now());
let nowTimer: ReturnType<typeof setInterval> | null = null;
for (const m of props.recent) seenAt.set(m.id, 0);
watch(
  () => props.recent.length,
  () => {
    const t = Date.now();
    for (const m of props.recent) if (!seenAt.has(m.id)) seenAt.set(m.id, t);
    now.value = t;
  },
);
const floating = computed(() =>
  props.recent.slice(-4).filter((m) => now.value - (seenAt.get(m.id) ?? 0) < FLOAT_MS),
);
const panelMessages = computed(() => props.recent.slice(-40));
const unseenWhileClosed = ref(0);
watch(
  () => props.recent.length,
  (n, before) => {
    if (!chatOpen.value && showOverlay.value) unseenWhileClosed.value += Math.max(0, n - before);
  },
);
const panelLog = ref<HTMLElement | null>(null);
async function scrollPanelToEnd() {
  await nextTick();
  if (panelLog.value) panelLog.value.scrollTop = panelLog.value.scrollHeight;
}
watch(
  () => props.recent.length,
  () => {
    if (chatOpen.value) scrollPanelToEnd();
  },
);

async function toggleChat() {
  chatOpen.value = !chatOpen.value;
  unseenWhileClosed.value = 0;
  wake();
  if (chatOpen.value) {
    await scrollPanelToEnd();
    chatInput.value?.focus();
  }
}

function sendFromOverlay() {
  const v = chatDraft.value.trim();
  if (!v) return;
  emit("send", v);
  chatDraft.value = "";
  // Keep the keyboard up: the next message follows right away.
  chatInput.value?.focus();
}

// One click on the picture toggles play/pause — but a double click (fullscreen) must not also toggle
// twice, so a single click waits a moment to see whether a second one follows.
let clickTimer: ReturnType<typeof setTimeout> | null = null;
function onVideoClick() {
  if (clickTimer) return;
  clickTimer = setTimeout(() => {
    clickTimer = null;
    requestToggle();
  }, 250);
}
function onDoubleClick(event: MouseEvent) {
  // Only a double click on the picture itself; double-clicking a button or the seek bar is not "fullscreen".
  if ((event.target as HTMLElement).tagName !== "VIDEO") return;
  if (clickTimer) {
    clearTimeout(clickTimer);
    clickTimer = null;
  }
  toggleFullscreen();
}

function fmt(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

function applyVolume() {
  video.value?.setVolume(volume.value, muted.value);
}
function toggleMute() {
  muted.value = !muted.value;
  applyVolume();
}

function onSliderInput(e: Event) {
  dragSec.value = Number((e.target as HTMLInputElement).value);
}
function onSliderChange(e: Event) {
  emit("seek", Number((e.target as HTMLInputElement).value));
  dragSec.value = null;
}

onMounted(() => {
  document.addEventListener("fullscreenchange", onFsChange);
  document.addEventListener("webkitfullscreenchange", onFsChange);
  nowTimer = setInterval(() => {
    now.value = Date.now();
  }, 1000);
  wake();
});
onUnmounted(() => {
  document.removeEventListener("fullscreenchange", onFsChange);
  document.removeEventListener("webkitfullscreenchange", onFsChange);
  if (hideTimer) clearTimeout(hideTimer);
  if (clickTimer) clearTimeout(clickTimer);
  if (nowTimer) clearInterval(nowTimer);
});

defineExpose({
  applyCorrection: (sec: number) => video.value?.applyCorrection(sec),
  setPlaying: (p: boolean) => video.value?.setPlaying(p),
  refreshDuration: () => {
    durationSec.value = video.value?.getDuration() ?? 0;
    return durationSec.value;
  },
  toggleFullscreen,
  toggleMute,
});
</script>

<template>
  <div
    ref="stage"
    class="stage"
    :class="{ fs: inFullscreen, pseudo: pseudoFullscreen, 'show-controls': controlsVisible || !playing, 'chat-open': chatOpen && showOverlay }"
    @pointermove="wake"
    @pointerdown="wake"
    @dblclick.prevent="onDoubleClick"
  >
    <VideoPlayer
      ref="video"
      :src="src"
      :want-playing="playing"
      @toggle="onVideoClick"
      @ready="onReady"
      @ended="emit('ended')"
      @stall="emit('stall', $event)"
      @unsupported="unsupported = true"
    />

    <div v-if="unsupported" class="unsupported" data-testid="unsupported" role="alert">
      Этот браузер не умеет воспроизводить потоковое видео. Откройте комнату в Chrome, Safari (iOS 17.1+), Firefox или Edge.
    </div>

    <div v-if="waitingFor.length > 0" class="waiting" data-testid="waiting-banner" role="status">
      <span class="spinner" aria-hidden="true"></span>
      <span>Подгружаем кадры у: {{ waitingFor.join(", ") }}</span>
    </div>

    <div v-if="gated" class="gate" data-testid="startup-gate" role="status">
      <span class="spinner" aria-hidden="true"></span>
      <span>Загружаем первые секунды…</span>
    </div>

    <button v-else-if="!playing && waitingFor.length === 0" class="big-play" aria-label="Смотреть" @click="requestToggle">
      <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true"><path d="M8 5.5v13l11-6.5z" fill="currentColor" /></svg>
    </button>

    <div v-if="title" class="title">{{ title }}</div>

    <!-- Chat over the picture: fullscreen, and phone landscape -->
    <template v-if="showOverlay">
      <ul v-if="!chatOpen && floating.length" class="float-log" aria-hidden="true">
        <li v-for="m in floating" :key="m.id"><b>{{ m.userId === selfId ? "Вы" : m.displayName }}</b> {{ m.body }}</li>
      </ul>

      <aside v-if="chatOpen" class="chat-sheet" aria-label="Чат поверх видео" @pointerdown.stop @dblclick.stop>
        <header class="sheet-head">
          <span>Чат</span>
          <button type="button" class="icon" aria-label="Скрыть чат" @click="toggleChat">✕</button>
        </header>
        <ul ref="panelLog" class="sheet-log">
          <li v-if="panelMessages.length === 0" class="sheet-empty">Пока тихо. Напишите первым.</li>
          <li v-for="m in panelMessages" :key="m.id" :class="{ mine: m.userId === selfId }">
            <b>{{ m.userId === selfId ? "Вы" : m.displayName }}</b> {{ m.body }}
          </li>
        </ul>
        <form class="sheet-form" @submit.prevent="sendFromOverlay">
          <input
            ref="chatInput"
            v-model="chatDraft"
            type="text"
            maxlength="2000"
            placeholder="Сообщение…"
            aria-label="Сообщение"
            enterkeyhint="send"
            autocomplete="off"
          />
          <button type="submit" class="send" :disabled="!chatDraft.trim()" aria-label="Отправить" @mousedown.prevent>➤</button>
        </form>
      </aside>
    </template>

    <div class="controls" @pointerdown.stop>
      <button
        class="icon"
        data-testid="play-toggle"
        :disabled="gated"
        :aria-label="playing ? 'Пауза' : 'Смотреть'"
        @click="requestToggle"
      >
        {{ playing ? "❚❚" : "▶" }}
      </button>
      <span class="time">{{ fmt(dragSec ?? positionSec) }}</span>
      <input
        class="seek"
        data-testid="seek"
        type="range"
        min="0"
        :max="durationSec || 1"
        step="1"
        :value="dragSec ?? positionSec"
        :disabled="!durationSec"
        aria-label="Перемотка"
        @input="onSliderInput"
        @change="onSliderChange"
      />
      <span class="time dim">{{ fmt(durationSec) }}</span>
      <button class="icon" :aria-label="muted ? 'Включить звук' : 'Выключить звук'" @click="toggleMute">
        {{ muted || volume === 0 ? "🔇" : "🔊" }}
      </button>
      <input v-model.number="volume" class="vol" type="range" min="0" max="1" step="0.05" aria-label="Громкость" @input="applyVolume" />
      <button
        v-if="showOverlay"
        class="icon chat-btn"
        :aria-label="chatOpen ? 'Скрыть чат' : 'Чат'"
        :aria-pressed="chatOpen"
        @click="toggleChat"
      >
        💬<span v-if="unseenWhileClosed > 0" class="dot">{{ unseenWhileClosed > 9 ? "9+" : unseenWhileClosed }}</span>
      </button>
      <button class="icon" :aria-label="inFullscreen ? 'Выйти из полноэкранного режима' : 'На весь экран'" @click="toggleFullscreen">
        {{ inFullscreen ? "⤡" : "⛶" }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.stage {
  position: relative;
  background: #000;
  border-radius: var(--radius-lg);
  overflow: hidden;
  box-shadow: var(--shadow-lg);
  aspect-ratio: 16 / 9;
  /* The room decides how tall the picture may get (phone portrait, landscape, desktop). */
  max-height: var(--stage-max-h, calc(100dvh - 8rem));
  width: 100%;
  margin-inline: auto;
  isolation: isolate;
}
.stage.fs {
  border-radius: 0;
  max-height: none;
  height: 100%;
  aspect-ratio: auto;
}
.stage.pseudo {
  position: fixed;
  inset: 0;
  z-index: 9999;
  padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);
}
.stage :deep(.video) {
  width: 100%;
  height: 100%;
  max-height: none;
  aspect-ratio: auto;
  border-radius: 0;
  box-shadow: none;
  object-fit: contain;
}
.unsupported {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  padding: var(--space-5);
  text-align: center;
  background: rgb(8 8 11 / 0.92);
  z-index: 5;
}
.gate {
  position: absolute;
  inset: 0;
  margin: auto;
  width: fit-content;
  height: fit-content;
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-5);
  border-radius: var(--radius-full);
  background: rgb(8 8 11 / 0.85);
  font-size: var(--text-sm);
  z-index: 3;
}
.big-play {
  position: absolute;
  inset: 0;
  margin: auto;
  width: 4.5rem;
  height: 4.5rem;
  padding: 0 0 0 4px;
  border-radius: 50%;
  box-shadow: var(--shadow-accent);
  z-index: 2;
}
.title {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  padding: var(--space-3) var(--space-4) var(--space-6);
  font-size: var(--text-sm);
  font-weight: 600;
  background: linear-gradient(rgb(0 0 0 / 0.65), transparent);
  opacity: 0;
  transition: opacity 200ms;
  pointer-events: none;
  text-shadow: 0 1px 3px #000;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.show-controls .title,
.show-controls .controls {
  opacity: 1;
}
.waiting {
  position: absolute;
  top: var(--space-4);
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-4);
  border-radius: var(--radius-full);
  background: rgb(8 8 11 / 0.88);
  border: 1px solid var(--color-accent-line);
  font-size: var(--text-sm);
  z-index: 3;
  max-width: 90%;
}
.spinner {
  width: 1rem;
  height: 1rem;
  border: 2px solid var(--color-border-strong);
  border-top-color: var(--color-accent);
  border-radius: 50%;
  animation: spin 700ms linear infinite;
  flex: none;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
.controls {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-6) var(--space-3) var(--space-2);
  background: linear-gradient(transparent, rgb(0 0 0 / 0.8));
  opacity: 0;
  transition: opacity 200ms;
  z-index: 4;
}
.controls .icon {
  position: relative;
  background: transparent;
  color: #fff;
  width: 2.75rem;
  min-height: 2.75rem;
  font-size: 1rem;
  border-radius: var(--radius);
}
.controls .icon:hover:not(:disabled) {
  background: rgb(255 255 255 / 0.15);
  box-shadow: none;
}
.chat-btn[aria-pressed="true"] {
  background: var(--color-accent-soft);
}
.dot {
  position: absolute;
  top: 2px;
  right: 2px;
  min-width: 1.1rem;
  height: 1.1rem;
  padding: 0 3px;
  border-radius: var(--radius-full);
  background: var(--color-accent);
  color: var(--color-accent-contrast);
  font-size: 0.65rem;
  font-weight: 800;
  line-height: 1.1rem;
}
.time {
  font-size: var(--text-xs);
  min-width: 2.6rem;
  color: #fff;
}
.time.dim {
  color: rgb(255 255 255 / 0.65);
}
.seek {
  flex: 1;
  min-width: 4rem;
  min-height: 2.75rem;
  padding: 0;
  border: none;
  background: none;
  accent-color: var(--color-accent);
}
.vol {
  width: 5rem;
  padding: 0;
  border: none;
  background: none;
  accent-color: var(--color-accent);
}

/* Floating messages, bottom-left, above the controls. */
.float-log {
  position: absolute;
  left: var(--space-3);
  bottom: 4rem;
  width: min(24rem, 65%);
  list-style: none;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: var(--text-sm);
  line-height: 1.35;
  text-shadow: 0 1px 3px #000;
  pointer-events: none;
  z-index: 3;
}
.float-log li {
  background: rgb(8 8 11 / 0.55);
  padding: 0.25rem 0.65rem;
  border-radius: 12px;
  width: fit-content;
  max-width: 100%;
  overflow-wrap: anywhere;
  animation: float-in 200ms ease-out, float-out 600ms ease-in 5.2s forwards;
}
.float-log b,
.sheet-log b {
  color: var(--color-accent);
  margin-right: 0.3rem;
}
@keyframes float-in {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
}
@keyframes float-out {
  to {
    opacity: 0;
  }
}

/* Slide-in chat over the right side of the picture. */
.chat-sheet {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: min(20rem, 46%);
  display: flex;
  flex-direction: column;
  background: rgb(8 8 11 / 0.78);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border-left: 1px solid rgb(255 255 255 / 0.08);
  z-index: 5;
  animation: sheet-in 180ms ease-out;
}
@keyframes sheet-in {
  from {
    transform: translateX(100%);
  }
}
.chat-open .controls {
  right: min(20rem, 46%);
}
.sheet-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-1) var(--space-1) var(--space-1) var(--space-4);
  font-family: var(--font-display);
  font-size: var(--text-sm);
}
.sheet-head .icon {
  background: transparent;
  color: var(--color-text-muted);
  width: 2.75rem;
  min-height: 2.75rem;
}
.sheet-log {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  list-style: none;
  padding: var(--space-2) var(--space-3);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  font-size: var(--text-sm);
  line-height: 1.35;
}
.sheet-log li {
  overflow-wrap: anywhere;
}
.sheet-log li.mine b {
  color: var(--color-text-muted);
}
.sheet-empty {
  margin: auto;
  color: var(--color-text-faint);
}
.sheet-form {
  display: flex;
  gap: var(--space-2);
  padding: var(--space-2);
}
.sheet-form input {
  flex: 1;
  min-width: 0;
  min-height: 2.75rem;
  padding: var(--space-2) var(--space-4);
  font-size: 16px;
  background: rgb(0 0 0 / 0.55);
  border-radius: var(--radius-full);
}
.sheet-form .send {
  flex: none;
  width: 2.75rem;
  padding: 0;
  border-radius: 50%;
}

@media (max-width: 40rem) {
  .vol {
    display: none;
  }
  .stage {
    border-radius: 0;
    box-shadow: none;
  }
  .controls {
    padding-inline: var(--space-1);
  }
  .chat-sheet {
    width: min(20rem, 60%);
  }
  .chat-open .controls {
    right: min(20rem, 60%);
  }
}
</style>
