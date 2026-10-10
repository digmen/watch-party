<script setup lang="ts">
import type { RoomDto, VideoAssetDto } from "@watch-party/shared";
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { API_ORIGIN, ApiError } from "../api/client";
import { queueApi } from "../api/queue.api";
import { roomsApi } from "../api/rooms.api";
import { videosApi } from "../api/videos.api";
import GuestJoinPrompt from "../components/GuestJoinPrompt.vue";
import AddVideoCard from "../components/room/AddVideoCard.vue";
import ChatPanel, { type ChatNotice } from "../components/room/ChatPanel.vue";
import PlayerStage from "../components/room/PlayerStage.vue";
import QueuePanel from "../components/room/QueuePanel.vue";
import RoomTopBar from "../components/room/RoomTopBar.vue";
import { usePageSeo } from "../seo";
import { humanize, useAuthStore } from "../stores/auth.store";
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

// --- access -------------------------------------------------------------------------------
const entering = ref(false);
// True once the socket has joined the room and the first data is in. Before that the room UI must not
// be usable: a chat message typed in that gap would go nowhere and vanish without a trace.
const entered = ref(false);
const enterError = ref<string | null>(null);
const notFound = ref(false);
const requiresPassword = ref(false);
const passwordPrompt = ref(false);
const passwordInput = ref("");
const passwordError = ref<string | null>(null);
const roomInfo = ref<RoomDto | null>(null);
const roomOwnerId = ref<string | null>(null);

// --- video --------------------------------------------------------------------------------
const videoAsset = ref<VideoAssetDto | null>(null);
const addingVideo = ref(false);
const addVideoError = ref<string | null>(null);
const queuePanel = ref<InstanceType<typeof QueuePanel> | null>(null);
const queueError = ref<string | null>(null);
const preparingSince = ref<number>(0);
const preparingSeconds = ref(0);
const displaySeconds = ref(0);

// --- ui -----------------------------------------------------------------------------------
const copied = ref(false);
const settingsOpen = ref(false);
const settingsVisibility = ref<"public" | "private">("private");
const settingsQueuePolicy = ref<"everyone" | "owner">("everyone");
const settingsPassword = ref("");
const settingsSaving = ref(false);
const settingsMessage = ref<string | null>(null);
const notices = ref<ChatNotice[]>([]);

let tickTimer: ReturnType<typeof setInterval> | null = null;
let statusPollTimer: ReturnType<typeof setInterval> | null = null;
let firstVideoTimer: ReturnType<typeof setInterval> | null = null;
const stageRef = ref<InstanceType<typeof PlayerStage> | null>(null);

const roomUrl = computed(() => `${window.location.origin}/rooms/${roomId}`);
const isRoomOwner = computed(() => roomOwnerId.value !== null && roomOwnerId.value === auth.user?.id);
// Invited guests watch what the host picked. A guest who *started* the room is its host and may
// pick the video — the backend enforces the same rule on addVideo; this keeps the UI honest.
// Who may add to the queue is the owner's call (room setting); the owner always may.
const canAddVideo = computed(
  () => auth.isAuthenticated && (isRoomOwner.value || roomInfo.value?.queueAddPolicy !== "owner"),
);
const isPlaying = computed(() => player.playback.status === "playing");
// What the people in the room INTEND: while the room is held for someone's missing frames it is
// "paused" on the server, but everyone's intent is still "playing" — and the one button must say
// "pause" then. (It used to say ▶, so the host's click meant "play" and he could never stop it.)
const intendsToPlay = computed(() => isPlaying.value || player.waitingFor.length > 0);
// Nothing to watch yet (or the current video could not be prepared): the big "what do we watch" card.
const showAddVideo = computed(() => canAddVideo.value && (!videoAsset.value || videoAsset.value.status === "failed"));const alone = computed(() => player.members.length <= 1);

// People who typed within the last few seconds. `clock` ticks once a second so the label fades by itself.
const clock = ref(Date.now());
const typingNames = computed(() =>
  Object.entries(chat.typing)
    .filter(([userId, t]) => userId !== auth.user?.id && clock.value - t.at < 4000)
    .map(([, t]) => t.name),
);
let clockTimer: ReturnType<typeof setInterval> | null = null;

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
    // An unhandled rejection in here would skip the clearInterval below and turn a failing request
    // into an unkillable retry loop for the life of the page.
    try {
      const { video } = await videosApi.getStatus(assetId);
      videoAsset.value = video;
      if (video.status === "ready" || video.status === "failed") stopPolling();
    } catch {
      stopPolling();
    }
  }, 2000);
}

function trackAsset(video: VideoAssetDto | null) {
  videoAsset.value = video;
  if (video && video.status !== "ready" && video.status !== "failed") {
    if (!preparingSince.value) preparingSince.value = Date.now();
    pollUntilSettled(video.id);
  } else {
    preparingSince.value = 0;
  }
}

async function submitVideo(sourceUrl: string) {
  addingVideo.value = true;
  addVideoError.value = null;
  queueError.value = null;
  try {
    const { video, becameCurrent } = await videosApi.add(roomId, { sourceUrl });
    // A video that went to the queue must not replace what is on screen; only a new CURRENT one does.
    if (becameCurrent) {
      preparingSince.value = 0;
      trackAsset(video);
    }
  } catch (err) {
    const message = err instanceof Error && err.message ? err.message : "Не удалось добавить видео";
    addVideoError.value = message;
    queueError.value = message;
  } finally {
    addingVideo.value = false;
  }
}

async function queueAction(action: () => Promise<unknown>) {
  queueError.value = null;
  try {
    await action();
  } catch (err) {
    queueError.value = err instanceof Error && err.message ? err.message : "Не получилось";
  }
}
const playQueueItem = (id: string) => queueAction(() => queueApi.playNow(roomId, id));
const removeQueueItem = (id: string) => queueAction(() => queueApi.remove(roomId, id));
const reorderQueue = (order: string[]) => queueAction(() => queueApi.reorder(roomId, order));
const nextInQueue = () => queueAction(() => queueApi.next(roomId));

async function copyRoomLink() {
  try {
    await navigator.clipboard.writeText(roomUrl.value);
    copied.value = true;
    setTimeout(() => {
      copied.value = false;
    }, 2000);
  } catch {
    // Clipboard can be refused (insecure context, permissions); the address bar still has the link.
  }
}

// Everything that requires a session. Split out of onMounted so the guest prompt can call it
// again after the guest signs in, without a page reload.
async function enterRoom(password?: string) {
  entering.value = true;
  enterError.value = null;
  try {
    const joined = await roomsApi.join(roomId, password);
    roomOwnerId.value = joined.room.ownerId;
    roomInfo.value = joined.room;
    settingsVisibility.value = joined.room.visibility;
    settingsQueuePolicy.value = joined.room.queueAddPolicy;
    passwordPrompt.value = false;
    await player.enterRoom(roomId);
    await chat.enterRoom(roomId);

    // Subscribed here rather than in setup(): the socket only exists once enterRoom has run.
    player.onVideoChanged((video) => {
      preparingSince.value = 0;
      trackAsset(video);
    });

    // After a network drop the room may have switched videos without us: look again.
    player.onReconnected(async () => {
      try {
        const latest = await videosApi.latestForRoom(roomId);
        if (latest.video?.id !== videoAsset.value?.id || latest.video?.status !== videoAsset.value?.status) {
          trackAsset(latest.video);
        }
      } catch {
        // The next reconnect or the status poll catches up.
      }
    });

    const { video } = await videosApi.latestForRoom(roomId);
    trackAsset(video);
    // A room whose video is added later must not sit dead: keep re-checking until one appears.
    if (!video) pollForFirstVideo();

    tickTimer = setInterval(() => {
      displaySeconds.value = player.getDisplayPositionSec();
      stageRef.value?.applyCorrection(displaySeconds.value);
      stageRef.value?.setPlaying(isPlaying.value);
      stageRef.value?.refreshDuration();
      if (preparingSince.value) preparingSeconds.value = Math.round((Date.now() - preparingSince.value) / 1000);
    }, 200);
    entered.value = true;
  } catch (err) {
    if (err instanceof ApiError && (err.message === "PASSWORD_REQUIRED" || err.message === "WRONG_PASSWORD")) {
      passwordPrompt.value = true;
      passwordError.value = err.message === "WRONG_PASSWORD" ? humanize(err.message) : null;
    } else if (err instanceof ApiError && err.status === 404) {
      notFound.value = true;
    } else if (err instanceof ApiError && /no longer active/i.test(err.message)) {
      enterError.value = "Эта комната закрыта хозяином или удалена за неактивность. Попросите новую ссылку.";
    } else if (err instanceof ApiError && err.status === 429) {
      enterError.value = "Слишком много попыток. Подождите минуту и обновите страницу.";
    } else {
      enterError.value = "Не удалось войти в комнату. Обновите страницу или попросите новую ссылку.";
    }
  } finally {
    entering.value = false;
  }
}

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

async function submitPassword() {
  await enterRoom(passwordInput.value);
}

async function handleGuestJoin(displayName: string, password: string) {
  entering.value = true;
  try {
    await auth.joinAsGuest(roomId, displayName, password);
    await enterRoom();
  } catch {
    // auth.error already carries the message; the prompt renders it.
  } finally {
    entering.value = false;
  }
}

async function saveSettings() {
  settingsSaving.value = true;
  settingsMessage.value = null;
  try {
    const dto: { visibility: "public" | "private"; password?: string | null; queueAddPolicy: "everyone" | "owner" } = {
      visibility: settingsVisibility.value,
      queueAddPolicy: settingsQueuePolicy.value,
    };
    if (settingsPassword.value) dto.password = settingsPassword.value;
    const { room } = await roomsApi.update(roomId, dto);
    roomInfo.value = room;
    settingsPassword.value = "";
    settingsMessage.value = "Сохранено";
  } catch {
    settingsMessage.value = "Не удалось сохранить";
  } finally {
    settingsSaving.value = false;
  }
}

async function removePassword() {
  settingsSaving.value = true;
  try {
    const { room } = await roomsApi.update(roomId, { password: null });
    roomInfo.value = room;
    settingsMessage.value = "Пароль убран";
  } catch {
    settingsMessage.value = "Не удалось сохранить";
  } finally {
    settingsSaving.value = false;
  }
}

// --- playback controls --------------------------------------------------------------------
function togglePlay() {
  if (!auth.user) return;
  if (intendsToPlay.value) player.pause(auth.user.id);
  else player.play(auth.user.id);
}

function seekTo(sec: number) {
  if (!auth.user) return;
  const max = stageRef.value?.refreshDuration() || sec;
  player.seek(auth.user.id, Math.min(Math.max(0, sec), max));
}

// Space / K play-pause, arrows ±10 s, F fullscreen, M mute — but never while typing.
function onKeydown(event: KeyboardEvent) {
  const target = event.target as HTMLElement | null;
  if (target && ["INPUT", "TEXTAREA", "BUTTON", "SELECT"].includes(target.tagName)) return;
  if (videoAsset.value?.status !== "ready") return;
  const key = event.key.toLowerCase();
  if (event.key === " " || key === "k") {
    event.preventDefault();
    togglePlay();
  } else if (event.key === "ArrowRight") seekTo(displaySeconds.value + 10);
  else if (event.key === "ArrowLeft") seekTo(displaySeconds.value - 10);
  else if (key === "f") stageRef.value?.toggleFullscreen();
  else if (key === "m") stageRef.value?.toggleMute();
}

// "Друг зашёл / вышел" — local notices derived from presence, not stored messages.
let knownMembers = new Map<string, string>();
watch(
  () => player.members,
  (members) => {
    const next = new Map(members.map((m) => [m.userId, m.displayName]));
    if (knownMembers.size > 0) {
      for (const [id, name] of next) {
        if (!knownMembers.has(id) && id !== auth.user?.id) pushNotice(`${name} зашёл(а) в комнату`);
      }
      for (const [id, name] of knownMembers) {
        if (!next.has(id)) pushNotice(`${name} вышел(а)`);
      }
    }
    knownMembers = next;
  },
  { deep: true },
);
function pushNotice(body: string) {
  notices.value = [
    ...notices.value.slice(-20),
    { id: crypto.randomUUID(), system: true, body, createdAt: new Date().toISOString() },
  ];
}

onMounted(async () => {
  window.addEventListener("keydown", onKeydown);
  clockTimer = setInterval(() => {
    clock.value = Date.now();
  }, 1000);
  try {
    const { room } = await roomsApi.preview(roomId);
    requiresPassword.value = room.requiresPassword;
  } catch {
    notFound.value = true;
    return;
  }
  if (auth.isAuthenticated) return enterRoom();
});

onUnmounted(() => {
  window.removeEventListener("keydown", onKeydown);
  if (clockTimer) clearInterval(clockTimer);
  if (tickTimer) clearInterval(tickTimer);
  if (firstVideoTimer) clearInterval(firstVideoTimer);
  stopPolling();
  player.leaveRoom();
  chat.leaveRoom();
});

function leave() {
  router.push(auth.isGuest ? "/" : "/rooms");
}
</script>

<template>
  <main v-if="notFound" class="gate">
    <h1>Комната не найдена</h1>
    <p class="lede">Ссылка устарела или в ней опечатка. Возможно, комнату уже закрыли.</p>
    <RouterLink class="btn" to="/">На главную</RouterLink>
  </main>

  <GuestJoinPrompt
    v-else-if="!auth.isAuthenticated"
    :submitting="entering"
    :error="auth.error"
    :requires-password="requiresPassword"
    @submit="handleGuestJoin"
  />

  <main v-else-if="passwordPrompt" class="gate">
    <h1>Комната под паролем</h1>
    <p class="lede">Введите пароль, который вам сообщил хозяин комнаты.</p>
    <form class="gate-form" @submit.prevent="submitPassword">
      <input v-model="passwordInput" type="password" required autofocus autocomplete="off" placeholder="Пароль" aria-label="Пароль комнаты" />
      <button type="submit" :disabled="entering || !passwordInput">{{ entering ? "Проверяем…" : "Войти" }}</button>
    </form>
    <p v-if="passwordError" class="error" role="alert">{{ passwordError }}</p>
  </main>

  <p v-else-if="enterError" class="enter-error error" role="alert">{{ enterError }}</p>

  <main v-else-if="!entered" class="gate" role="status" data-testid="entering">
    <span class="spinner" aria-hidden="true"></span>
    <p class="lede">Заходим в комнату…</p>
  </main>

  <div v-else class="room">
    <RoomTopBar
      :name="roomInfo?.name ?? ''"
      :visibility="roomInfo?.visibility ?? 'private'"
      :has-password="roomInfo?.hasPassword ?? false"
      :members="player.members"
      :can-manage="canAddVideo && !showAddVideo"
      :is-owner="isRoomOwner"
      :copied="copied"
      :back-label="auth.isGuest ? 'На главную' : 'К комнатам'"
      @back="leave"
      @copy="copyRoomLink"
      @add-video="queuePanel?.focusInput()"
      @settings="settingsOpen = !settingsOpen"
    />

    <section v-if="settingsOpen && isRoomOwner" class="settings">
      <h2>Доступ к комнате</h2>
      <label class="opt">
        <input v-model="settingsVisibility" type="radio" value="private" />
        <span><b>По ссылке</b> Только те, у кого есть ссылка.</span>
      </label>
      <label class="opt">
        <input v-model="settingsVisibility" type="radio" value="public" />
        <span><b>Публичная</b> Видна в списке публичных комнат.</span>
      </label>
      <fieldset class="policy">
        <legend>Кто добавляет видео в очередь</legend>
        <label class="opt">
          <input v-model="settingsQueuePolicy" type="radio" value="everyone" />
          <span><b>Все в комнате</b> Любой участник может поставить видео в очередь.</span>
        </label>
        <label class="opt">
          <input v-model="settingsQueuePolicy" type="radio" value="owner" />
          <span><b>Только хозяин</b> Остальные только смотрят.</span>
        </label>
      </fieldset>
      <div class="pw-row">
        <input
          v-model="settingsPassword"
          type="text"
          maxlength="72"
          autocomplete="off"
          :placeholder="roomInfo?.hasPassword ? 'Новый пароль (пусто — не менять)' : 'Пароль (необязательно)'"
          aria-label="Пароль комнаты"
        />
        <button v-if="roomInfo?.hasPassword" class="ghost" :disabled="settingsSaving" @click="removePassword">Убрать пароль</button>
      </div>
      <div class="row">
        <button :disabled="settingsSaving" @click="saveSettings">{{ settingsSaving ? "Сохраняем…" : "Сохранить" }}</button>
        <button class="quiet" @click="settingsOpen = false">Закрыть</button>
        <span v-if="settingsMessage" class="saved">{{ settingsMessage }}</span>
      </div>
    </section>

    <div class="layout">
      <section class="main">
        <AddVideoCard
          v-if="showAddVideo"
          :busy="addingVideo"
          :error="addVideoError ?? (videoAsset?.status === 'failed' ? videoAsset.failureReason : null)"
          :hero="!videoAsset || videoAsset.status === 'failed'"
          :can-cancel="false"
          @submit="submitVideo"
        />

        <PlayerStage
          v-else-if="videoAsset?.status === 'ready'"
          ref="stageRef"
          :src="fullPlaybackUrl(videoAsset)"
          :asset-id="videoAsset.id"
          :playing="intendsToPlay"
          :position-sec="displaySeconds"
          :waiting-for="player.waitingFor"
          :title="videoAsset.title"
          :recent="chat.messages"
          @toggle="togglePlay"
          @seek="seekTo"
          @stall="player.reportStall"
          @send="chat.send"
          @ready="player.reportReady"
          @ended="player.reportEnded(videoAsset.id)"
        />

        <QueuePanel
          v-if="videoAsset"
          ref="queuePanel"
          :items="player.queue"
          :can-add="canAddVideo"
          :is-owner="isRoomOwner"
          :self-id="auth.user?.id ?? null"
          :busy="addingVideo"
          :error="queueError"
          @add="submitVideo"
          @play="playQueueItem"
          @remove="removeQueueItem"
          @reorder="reorderQueue"
          @next="nextInQueue"
        />

        <div v-else-if="videoAsset" class="preparing" role="status">
          <span class="spinner" aria-hidden="true"></span>
          <div>
            <p class="p-title">Готовим видео…</p>
            <p class="p-sub">
              Сервер скачивает поток, чтобы он не тормозил ни у кого из вас.
              <template v-if="preparingSeconds > 8">Уже {{ preparingSeconds }} с — для длинных видео и медленных источников это нормально.</template>
            </p>
          </div>
        </div>

        <div v-else class="stage-empty">
          <span class="icon" aria-hidden="true">▶</span>
          <p>Ждём, пока хозяин комнаты выберет, что смотрим…</p>
        </div>
      </section>

      <aside class="side">
        <ChatPanel
          :messages="chat.messages"
          :notices="notices"
          :self-id="auth.user?.id ?? null"
          :alone="alone"
          :invite-copied="copied"
          :typing-names="typingNames"
          @send="chat.send"
          @typing="chat.notifyTyping"
          @invite="copyRoomLink"
        />
      </aside>
    </div>
  </div>
</template>

<style scoped>
.room {
  display: flex;
  flex-direction: column;
  height: 100dvh;
  background: var(--color-bg);
}
.layout {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.main {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  min-width: 0;
}
.side {
  flex: 1;
  min-height: 0;
}

/* Desktop: video on the left, chat full-height on the right. */
@media (min-width: 56rem) {
  .layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 22rem;
  }
  .main {
    padding: var(--space-4);
    overflow-y: auto;
    justify-content: flex-start;
  }
}
@media (min-width: 90rem) {
  .layout {
    grid-template-columns: minmax(0, 1fr) 26rem;
  }
}

.settings {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-4);
  background: var(--color-surface-raised);
  border-bottom: 1px solid var(--color-border);
}
.settings h2 {
  font-size: var(--text-lg);
}
.opt {
  display: flex;
  gap: var(--space-3);
  align-items: flex-start;
  cursor: pointer;
}
.opt input {
  width: auto;
  margin-top: 0.3rem;
  accent-color: var(--color-accent);
}
.opt b {
  display: block;
}
.opt span {
  color: var(--color-text-muted);
  font-size: var(--text-sm);
}
.policy {
  border: none;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
.policy legend {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
  margin-bottom: var(--space-2);
}
.pw-row,
.row {
  display: flex;
  gap: var(--space-2);
  flex-wrap: wrap;
  align-items: center;
}
.pw-row input {
  flex: 1;
  min-width: 14rem;
  max-width: 28rem;
}
.saved {
  color: var(--color-success);
  font-size: var(--text-sm);
}

.preparing,
.stage-empty {
  aspect-ratio: 16 / 9;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-4);
  padding: var(--space-5);
  text-align: left;
  border-radius: var(--radius-lg);
  background: linear-gradient(135deg, #1b2230, #10141b);
  color: var(--color-text-muted);
}
.stage-empty {
  flex-direction: column;
  text-align: center;
}
.stage-empty .icon {
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
.p-title {
  color: var(--color-text);
  font-weight: 600;
}
.p-sub {
  font-size: var(--text-sm);
  max-width: 28rem;
}
.spinner {
  width: 1.4rem;
  height: 1.4rem;
  border: 3px solid var(--color-border-strong);
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
@media (max-width: 56rem) {
  .preparing,
  .stage-empty {
    border-radius: 0;
    aspect-ratio: 16 / 10;
  }
}

.gate {
  max-width: 26rem;
  margin: var(--space-12) auto;
  padding: 0 var(--space-4);
  text-align: center;
}
.gate h1 {
  font-size: var(--text-2xl);
  margin-bottom: var(--space-2);
}
.gate .lede {
  color: var(--color-text-muted);
  margin-bottom: var(--space-5);
}
.gate-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
.gate .btn {
  display: inline-flex;
  padding: var(--space-3) var(--space-6);
  border-radius: var(--radius);
  background: var(--color-accent);
  color: var(--color-accent-contrast);
  font-weight: 600;
  text-decoration: none;
}
.enter-error {
  max-width: var(--container-narrow);
  margin: var(--space-10) auto;
  text-align: center;
}
</style>
