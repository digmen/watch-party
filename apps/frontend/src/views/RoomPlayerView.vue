<script setup lang="ts">
import type { VideoAssetDto } from "@watch-party/shared";
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { API_ORIGIN } from "../api/client";
import { roomsApi } from "../api/rooms.api";
import { videosApi } from "../api/videos.api";
import GuestJoinPrompt from "../components/GuestJoinPrompt.vue";
import VideoPlayer from "../components/VideoPlayer.vue";
import { usePageSeo } from "../seo";
import { useAuthStore } from "../stores/auth.store";
import { useChatStore } from "../stores/chat.store";
import { usePlayerStore } from "../stores/player.store";

const route = useRoute();
const router = useRouter();
const player = usePlayerStore();
const auth = useAuthStore();
const chat = useChatStore();

const roomId = route.params.id as string;

// A room is private (the UUID is the invite credential) and short-lived — it must never be
// indexed, and its URL must never leak through a referrer to whatever the video links to.
usePageSeo({
  title: "Комната — Watch Party",
  description: "Совместный просмотр видео в реальном времени.",
  path: `/rooms/${roomId}`,
  noindex: true,
});

const displaySeconds = ref(0);
const videoAsset = ref<VideoAssetDto | null>(null);
const sourceUrlInput = ref("");
const addingVideo = ref(false);
const addVideoError = ref<string | null>(null);
const chatInput = ref("");
const chatLog = ref<HTMLElement | null>(null);

const entering = ref(false);
const entered = ref(false);
const enterError = ref<string | null>(null);
const changingVideo = ref(false);
const copied = ref(false);
const durationSec = ref(0);
const volume = ref(1);
const muted = ref(false);
const boxRef = ref<HTMLElement | null>(null);
const dragSec = ref<number | null>(null);

let tickTimer: ReturnType<typeof setInterval> | null = null;
let statusPollTimer: ReturnType<typeof setInterval> | null = null;
const playerRef = ref<InstanceType<typeof VideoPlayer> | null>(null);

const roomUrl = computed(() => `${window.location.origin}/rooms/${roomId}`);
const isAlone = computed(() => player.members.length <= 1);
// Invited guests watch what the host picked. A guest who *started* the room is its host and may
// pick the video — the backend enforces the same rule on addVideo; this keeps the UI honest.
const roomOwnerId = ref<string | null>(null);
const isRoomOwner = computed(() => roomOwnerId.value !== null && roomOwnerId.value === auth.user?.id);
const canManageVideo = computed(() => auth.isAuthenticated && (!auth.isGuest || isRoomOwner.value));
const showVideoForm = computed(
  () => canManageVideo.value && (changingVideo.value || !videoAsset.value || videoAsset.value.status === "failed"),
);

function fullPlaybackUrl(video: VideoAssetDto): string {
  return `${API_ORIGIN}${video.playbackUrl}`;
}

function stopPolling() {
  if (statusPollTimer) clearInterval(statusPollTimer);
  statusPollTimer = null;
}

function pollUntilSettled(assetId: string) {
  stopPolling();
  statusPollTimer = setInterval(async () => {
    // An unhandled rejection in here doesn't just log noise — it skips the clearInterval below,
    // so a failing request turns into an unkillable 2-second retry loop for the life of the page.
    try {
      const { video } = await videosApi.getStatus(assetId);
      videoAsset.value = video;
      if (video.status === "ready" || video.status === "failed") stopPolling();
    } catch {
      // apiFetch already tries to refresh an expired session before surfacing an error, so
      // reaching here means polling genuinely can't continue (logged out, asset gone, backend
      // down). Retrying on a timer wouldn't fix any of those.
      stopPolling();
    }
  }, 2000);
}

function trackAsset(video: VideoAssetDto | null) {
  videoAsset.value = video;
  if (video && video.status !== "ready" && video.status !== "failed") pollUntilSettled(video.id);
}

async function submitVideo() {
  addingVideo.value = true;
  addVideoError.value = null;
  try {
    const { video } = await videosApi.add(roomId, { sourceUrl: sourceUrlInput.value });
    sourceUrlInput.value = "";
    changingVideo.value = false;
    trackAsset(video);
  } catch (err) {
    addVideoError.value = err instanceof Error && err.message ? err.message : "Не удалось добавить видео";
  } finally {
    addingVideo.value = false;
  }
}

async function copyRoomLink() {
  try {
    await navigator.clipboard.writeText(roomUrl.value);
    copied.value = true;
    setTimeout(() => {
      copied.value = false;
    }, 2000);
  } catch {
    // Clipboard access can be refused (insecure context, permissions) — leave the URL visible in
    // the input next to the button so it can still be copied by hand.
  }
}

// Everything that requires a session. Split out of onMounted so the guest prompt can call it
// again after the guest signs in, without a page reload.
async function enterRoom() {
  entering.value = true;
  enterError.value = null;
  try {
    const joined = await roomsApi.join(roomId);
    roomOwnerId.value = joined.room.ownerId;
    await player.enterRoom(roomId);
    await chat.enterRoom(roomId);

    // Subscribed here rather than in setup(): the socket only exists once enterRoom has run, and
    // roomSocket registers handlers against an optional socket — subscribing earlier is a no-op
    // that fails silently.
    player.onVideoChanged((video) => {
      changingVideo.value = false;
      trackAsset(video);
    });

    const { video } = await videosApi.latestForRoom(roomId);
    trackAsset(video);

    // A room whose video is added later must not sit dead: keep re-checking until one appears.
    // (The video:changed socket event covers the live case; this covers arriving in between.)
    if (!video) pollForFirstVideo();

    tickTimer = setInterval(() => {
      displaySeconds.value = player.getDisplayPositionSec();
      playerRef.value?.applyCorrection(displaySeconds.value);
      playerRef.value?.setPlaying(player.playback.status === "playing");
      durationSec.value = playerRef.value?.getDuration() ?? 0;
    }, 200);

    entered.value = true;
  } catch {
    enterError.value = "Не удалось войти в комнату. Обновите страницу или попросите новую ссылку.";
  } finally {
    entering.value = false;
  }
}

let firstVideoTimer: ReturnType<typeof setInterval> | null = null;
function pollForFirstVideo() {
  if (firstVideoTimer) return;
  firstVideoTimer = setInterval(async () => {
    try {
      const { video } = await videosApi.latestForRoom(roomId);
      if (video) {
        if (firstVideoTimer) clearInterval(firstVideoTimer);
        firstVideoTimer = null;
        trackAsset(video);
      }
    } catch {
      if (firstVideoTimer) clearInterval(firstVideoTimer);
      firstVideoTimer = null;
    }
  }, 3000);
}

async function handleGuestJoin(displayName: string) {
  entering.value = true;
  try {
    await auth.joinAsGuest(roomId, displayName);
    await enterRoom();
  } catch {
    // auth.error already carries the message; the prompt renders it.
  } finally {
    entering.value = false;
  }
}

onMounted(() => {
  window.addEventListener("keydown", onKeydown);
  if (auth.isAuthenticated) return enterRoom();
});

onUnmounted(() => {
  window.removeEventListener("keydown", onKeydown);
  if (tickTimer) clearInterval(tickTimer);
  if (firstVideoTimer) clearInterval(firstVideoTimer);
  stopPolling();
  player.leaveRoom();
  chat.leaveRoom();
});

watch(
  () => chat.messages.length,
  () => {
    nextTick(() => {
      if (chatLog.value) chatLog.value.scrollTop = chatLog.value.scrollHeight;
    });
  },
);

function togglePlay() {
  if (!auth.user) return;
  if (player.playback.status === "playing") {
    player.pause(auth.user.id);
  } else {
    player.play(auth.user.id);
  }
}

function formatTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

function seekTo(sec: number) {
  if (!auth.user) return;
  const max = durationSec.value > 0 ? durationSec.value : sec;
  player.seek(auth.user.id, Math.min(Math.max(0, sec), max));
}

function onSliderInput(event: Event) {
  dragSec.value = Number((event.target as HTMLInputElement).value);
}

function onSliderChange(event: Event) {
  seekTo(Number((event.target as HTMLInputElement).value));
  dragSec.value = null;
}

function applyVolume() {
  playerRef.value?.setVolume(volume.value, muted.value);
}

function toggleMute() {
  muted.value = !muted.value;
  applyVolume();
}

function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen();
  else boxRef.value?.requestFullscreen?.();
}

// Space / K play-pause, arrows ±10 s, F fullscreen, M mute — but never while typing in chat.
function onKeydown(event: KeyboardEvent) {
  const target = event.target as HTMLElement | null;
  if (target && ["INPUT", "TEXTAREA", "BUTTON"].includes(target.tagName)) return;
  if (videoAsset.value?.status !== "ready") return;
  if (event.key === " " || event.key.toLowerCase() === "k") {
    event.preventDefault();
    togglePlay();
  } else if (event.key === "ArrowRight") seekTo(displaySeconds.value + 10);
  else if (event.key === "ArrowLeft") seekTo(displaySeconds.value - 10);
  else if (event.key.toLowerCase() === "f") toggleFullscreen();
  else if (event.key.toLowerCase() === "m") toggleMute();
}

function submitChatMessage() {
  chat.send(chatInput.value);
  chatInput.value = "";
}

function leave() {
  router.push(auth.isGuest ? "/" : "/rooms");
}
</script>

<template>
  <GuestJoinPrompt
    v-if="!auth.isAuthenticated"
    :submitting="entering"
    :error="auth.error"
    @submit="handleGuestJoin"
  />

  <p v-else-if="enterError" class="enter-error error" role="alert">{{ enterError }}</p>

  <main v-else class="room">
    <header class="room-head">
      <button class="quiet" @click="leave">← {{ auth.isGuest ? "На главную" : "К комнатам" }}</button>

      <div class="share">
        <input type="text" :value="roomUrl" readonly aria-label="Ссылка на комнату" @focus="($event.target as HTMLInputElement).select()" />
        <button class="ghost" @click="copyRoomLink">{{ copied ? "Скопировано" : "Скопировать ссылку" }}</button>
      </div>
    </header>

    <p v-if="isAlone" class="invite-hint">
      Пока вы один. Отправьте ссылку другу — ему хватит имени, регистрация не нужна.
    </p>

    <section class="stage">
      <div class="player-area">
        <!--
          The form is tested BEFORE the player on purpose. As a `v-else-if` after it, the
          "ready" branch always won and the replace-video form was unreachable — which is exactly
          the bug this was meant to fix: once a video was playing there was no way to swap it.
        -->
        <form v-if="showVideoForm" class="add-video card" @submit.prevent="submitVideo">
          <h2>Что смотрим?</h2>
          <p class="hint">Вставьте ссылку на видео — прямую (.mp4, .m3u8), ok.ru или VK Видео. Друзья увидят его синхронно.</p>
          <input v-model="sourceUrlInput" type="url" required placeholder="https://…" />
          <div class="row">
            <button type="submit" :disabled="addingVideo">{{ addingVideo ? "Добавляем…" : "Добавить видео" }}</button>
            <button v-if="changingVideo" type="button" class="quiet" @click="changingVideo = false">Отмена</button>
          </div>
          <p v-if="videoAsset?.status === 'failed'" class="error">{{ videoAsset.failureReason }}</p>
          <p v-if="addVideoError" class="error">{{ addVideoError }}</p>
        </form>

        <div v-else-if="videoAsset?.status === 'ready'" ref="boxRef" class="player-box">
          <VideoPlayer ref="playerRef" :src="fullPlaybackUrl(videoAsset)" @toggle="togglePlay" />

          <div class="controls">
            <button class="icon" :aria-label="player.playback.status === 'playing' ? 'Пауза' : 'Смотреть'" @click="togglePlay">
              {{ player.playback.status === "playing" ? "❚❚" : "▶" }}
            </button>
            <span class="clock">{{ formatTime(dragSec ?? displaySeconds) }}</span>
            <input
              class="seek"
              type="range"
              min="0"
              :max="durationSec || 1"
              step="1"
              :value="dragSec ?? displaySeconds"
              :disabled="!durationSec"
              aria-label="Перемотка"
              @input="onSliderInput"
              @change="onSliderChange"
            />
            <span class="clock">{{ formatTime(durationSec) }}</span>
            <button class="icon quiet" :aria-label="muted ? 'Включить звук' : 'Выключить звук'" @click="toggleMute">
              {{ muted || volume === 0 ? "🔇" : "🔊" }}
            </button>
            <input
              v-model.number="volume"
              class="vol"
              type="range"
              min="0"
              max="1"
              step="0.05"
              aria-label="Громкость"
              @input="applyVolume"
            />
            <button class="icon quiet" aria-label="На весь экран" @click="toggleFullscreen">⛶</button>
          </div>
        </div>

        <div v-else-if="videoAsset" class="preparing card">
          <span class="spinner" aria-hidden="true"></span>
          <p>Готовим видео на сервере — сервер скачивает поток, чтобы он не тормозил ни у кого из вас.</p>
        </div>

        <div v-else class="stage-empty card">
          <span class="stage-icon" aria-hidden="true">▶</span>
          <p>Ждём, пока хозяин комнаты выберет, что смотрим…</p>
        </div>

        <div v-if="videoAsset?.status === 'ready' && canManageVideo && !changingVideo" class="manage">
          <button class="quiet" @click="changingVideo = true">Заменить видео</button>
        </div>
      </div>

      <aside class="side">
        <section class="members card">
          <h2>В комнате · {{ player.members.length }}</h2>
          <ul>
            <li v-for="m in player.members" :key="m.userId">{{ m.displayName }}</li>
          </ul>
        </section>

        <section class="chat card">
          <h2>Чат</h2>
          <div ref="chatLog" class="chat-log">
            <p v-if="chat.messages.length === 0" class="chat-empty">Пока тихо. Напишите первым.</p>
            <p v-for="m in chat.messages" :key="m.id" class="chat-message">
              <span class="chat-author">{{ m.displayName }}</span>{{ m.body }}
            </p>
          </div>
          <form class="chat-form" @submit.prevent="submitChatMessage">
            <input v-model="chatInput" type="text" maxlength="2000" placeholder="Написать…" aria-label="Сообщение" />
            <button type="submit" :disabled="!chatInput.trim()">→</button>
          </form>
        </section>
      </aside>
    </section>
  </main>
</template>

<style scoped>
.room {
  max-width: var(--container);
  margin: 0 auto;
  padding: var(--space-5) var(--space-4) var(--space-10);
}
.enter-error {
  max-width: var(--container-narrow);
  margin: var(--space-10) auto;
  text-align: center;
}
.room-head {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--space-4);
}
.share {
  display: flex;
  gap: var(--space-2);
  flex: 1;
  min-width: 16rem;
  max-width: 32rem;
}
.share input {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
  background: var(--color-surface);
  text-overflow: ellipsis;
}
.stage-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-4);
  aspect-ratio: 16 / 9;
  text-align: center;
  color: var(--color-text-muted);
  background: linear-gradient(135deg, #1b2230, #10141b);
}
.stage-icon {
  width: 3.5rem;
  height: 3.5rem;
  display: grid;
  place-items: center;
  padding-left: 4px;
  border-radius: 50%;
  background: var(--color-surface-raised);
  color: var(--color-accent);
  font-size: var(--text-xl);
}
.hint {
  color: var(--color-text-muted);
  font-size: var(--text-sm);
}
.share button {
  white-space: nowrap;
}
.invite-hint {
  color: var(--color-text-muted);
  font-size: var(--text-sm);
  margin-bottom: var(--space-4);
}

.stage {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 20rem;
  gap: var(--space-5);
  align-items: start;
}
@media (max-width: 60rem) {
  .stage {
    grid-template-columns: minmax(0, 1fr);
  }
}

.player-area {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  min-width: 0;
}
.add-video {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
.add-video h2 {
  font-size: var(--text-lg);
}
.row {
  display: flex;
  gap: var(--space-2);
  align-items: center;
}
.preparing {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  color: var(--color-text-muted);
}
.spinner {
  width: 1rem;
  height: 1rem;
  border: 2px solid var(--color-border-strong);
  border-top-color: var(--color-accent);
  border-radius: var(--radius-full);
  animation: spin 700ms linear infinite;
  flex-shrink: 0;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
.player-box {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  background: var(--color-bg);
}
.player-box:fullscreen {
  justify-content: center;
  padding: var(--space-4);
}
.controls {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}
.controls .icon {
  padding: var(--space-2) var(--space-3);
  min-width: 2.6rem;
}
.controls .seek {
  flex: 1;
  min-width: 6rem;
  padding: 0;
  accent-color: var(--color-accent);
  background: none;
  border: none;
}
.controls .vol {
  width: 5.5rem;
  padding: 0;
  accent-color: var(--color-accent);
  background: none;
  border: none;
}
.clock {
  color: var(--color-text-muted);
  font-size: var(--text-sm);
  min-width: 2.6rem;
}
@media (max-width: 40rem) {
  .controls .vol {
    display: none;
  }
}

.side {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  min-width: 0;
}
.side h2 {
  font-size: var(--text-sm);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--color-text-faint);
  margin-bottom: var(--space-3);
}
.members ul {
  list-style: none;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}
.members li {
  background: var(--color-surface-raised);
  border-radius: var(--radius-full);
  padding: var(--space-1) var(--space-3);
  font-size: var(--text-sm);
}
.chat-log {
  height: 16rem;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
.chat-empty {
  color: var(--color-text-faint);
  font-size: var(--text-sm);
}
.chat-message {
  font-size: var(--text-sm);
  word-break: break-word;
}
.chat-author {
  color: var(--color-accent);
  font-weight: 600;
  margin-right: var(--space-2);
}
.chat-form {
  display: flex;
  gap: var(--space-2);
  margin-top: var(--space-3);
}
.chat-form button {
  padding: var(--space-3) var(--space-4);
}
</style>
