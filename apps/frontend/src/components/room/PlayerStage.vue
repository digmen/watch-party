<script setup lang="ts">
import type { ChatMessageDto } from "@watch-party/shared";
import { computed, onMounted, onUnmounted, ref } from "vue";
import VideoPlayer from "../VideoPlayer.vue";

const props = defineProps<{
  src: string;
  assetId: string;
  playing: boolean;
  positionSec: number;
  waitingFor: string[];
  title: string | null;
  recent: ChatMessageDto[];
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

// Fullscreen: the real API where it exists, otherwise (iPhone Safari only fullscreens bare
// <video> elements, which would drop our controls and the chat) a fixed-position "theatre" mode.
const fullscreen = ref(false);
const pseudoFullscreen = ref(false);
const chatOpen = ref(false);
const chatDraft = ref("");

function onFsChange() {
  fullscreen.value = document.fullscreenElement === stage.value;
  if (!fullscreen.value) chatOpen.value = false;
}

async function toggleFullscreen() {
  const el = stage.value;
  if (!el) return;
  if (fullscreen.value || pseudoFullscreen.value) {
    if (document.fullscreenElement) await document.exitFullscreen().catch(() => {});
    pseudoFullscreen.value = false;
    fullscreen.value = false;
    chatOpen.value = false;
    return;
  }
  if (el.requestFullscreen) {
    try {
      await el.requestFullscreen();
      return;
    } catch {
      // fall through to the pseudo mode
    }
  }
  pseudoFullscreen.value = true;
}

const inFullscreen = computed(() => fullscreen.value || pseudoFullscreen.value);

// Newest few messages float over the picture in fullscreen, so a phone in landscape still has chat.
const overlayMessages = computed(() => props.recent.slice(-4));

function sendFromOverlay() {
  const v = chatDraft.value.trim();
  if (!v) return;
  emit("send", v);
  chatDraft.value = "";
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
  wake();
});
onUnmounted(() => {
  document.removeEventListener("fullscreenchange", onFsChange);
  if (hideTimer) clearTimeout(hideTimer);
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
    :class="{ fs: inFullscreen, pseudo: pseudoFullscreen, 'show-controls': controlsVisible || !playing }"
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

    <button v-else-if="!playing && waitingFor.length === 0" class="big-play" aria-label="Смотреть" @click="requestToggle">▶</button>

    <div v-if="title" class="title">{{ title }}</div>

    <!-- Chat over the picture, only while fullscreen -->
    <div v-if="inFullscreen" class="fs-chat" @pointerdown.stop>
      <ul v-if="overlayMessages.length" class="fs-log">
        <li v-for="m in overlayMessages" :key="m.id"><b>{{ m.displayName }}</b> {{ m.body }}</li>
      </ul>
      <form v-if="chatOpen" class="fs-form" @submit.prevent="sendFromOverlay">
        <input v-model="chatDraft" type="text" maxlength="2000" placeholder="Сообщение…" aria-label="Сообщение" autocomplete="off" />
        <button type="submit" :disabled="!chatDraft.trim()">➤</button>
      </form>
    </div>

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
      <button v-if="inFullscreen" class="icon" aria-label="Чат" @click="chatOpen = !chatOpen">💬</button>
      <button class="icon" aria-label="На весь экран" @click="toggleFullscreen">{{ inFullscreen ? "⤡" : "⛶" }}</button>
    </div>
  </div>
</template>

<style scoped>
.stage {
  position: relative;
  background: #000;
  border-radius: var(--radius-lg);
  overflow: hidden;
  box-shadow: var(--shadow);
  aspect-ratio: 16 / 9;
  max-height: calc(100dvh - 8rem);
  width: 100%;
  margin-inline: auto;
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
  background: rgb(10 13 18 / 0.92);
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
  background: rgb(10 13 18 / 0.85);
  font-size: var(--text-sm);
  z-index: 3;
}
.big-play {
  position: absolute;
  inset: 0;
  margin: auto;
  width: 4.5rem;
  height: 4.5rem;
  padding: 0 0 0 6px;
  border-radius: 50%;
  font-size: 1.6rem;
  background: rgb(255 107 90 / 0.92);
}
.title {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  padding: var(--space-3) var(--space-4) var(--space-6);
  font-size: var(--text-sm);
  background: linear-gradient(rgb(0 0 0 / 0.65), transparent);
  opacity: 0;
  transition: opacity 200ms;
  pointer-events: none;
  text-shadow: 0 1px 3px #000;
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
  background: rgb(10 13 18 / 0.88);
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
  gap: var(--space-2);
  padding: var(--space-6) var(--space-3) var(--space-2);
  background: linear-gradient(transparent, rgb(0 0 0 / 0.78));
  opacity: 0;
  transition: opacity 200ms;
}
.controls .icon {
  background: transparent;
  color: #fff;
  padding: var(--space-2);
  min-width: 2.4rem;
  font-size: 1rem;
}
.controls .icon:hover:not(:disabled) {
  background: rgb(255 255 255 / 0.15);
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
.fs-chat {
  position: absolute;
  left: var(--space-4);
  bottom: 4.2rem;
  width: min(26rem, 70%);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  z-index: 4;
}
.fs-log {
  list-style: none;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: var(--text-sm);
  text-shadow: 0 1px 3px #000;
}
.fs-log li {
  background: rgb(0 0 0 / 0.45);
  padding: 0.25rem 0.6rem;
  border-radius: 10px;
  width: fit-content;
  max-width: 100%;
  overflow-wrap: anywhere;
}
.fs-log b {
  color: var(--color-accent);
  margin-right: 0.3rem;
}
.fs-form {
  display: flex;
  gap: var(--space-2);
}
.fs-form input {
  flex: 1;
  font-size: 16px;
  background: rgb(0 0 0 / 0.65);
  border-radius: var(--radius-full);
}
.fs-form button {
  width: 2.6rem;
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
    max-height: 56vh;
  }
  .stage.fs {
    max-height: none;
  }
}
</style>
