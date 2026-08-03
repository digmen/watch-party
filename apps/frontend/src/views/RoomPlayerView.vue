<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import type { VideoAssetDto } from "@watch-party/shared";
import { usePlayerStore } from "../stores/player.store";
import { useAuthStore } from "../stores/auth.store";
import { useChatStore } from "../stores/chat.store";
import { roomsApi } from "../api/rooms.api";
import { videosApi } from "../api/videos.api";
import { API_ORIGIN } from "../api/client";
import VideoPlayer from "../components/VideoPlayer.vue";

const route = useRoute();
const router = useRouter();
const player = usePlayerStore();
const auth = useAuthStore();
const chat = useChatStore();

const roomId = route.params.id as string;
const displaySeconds = ref(0);
const videoAsset = ref<VideoAssetDto | null>(null);
const sourceUrlInput = ref("");
const addingVideo = ref(false);
const addVideoError = ref<string | null>(null);
const chatInput = ref("");
const chatLog = ref<HTMLElement | null>(null);

let tickTimer: ReturnType<typeof setInterval> | null = null;
let statusPollTimer: ReturnType<typeof setInterval> | null = null;
const playerRef = ref<InstanceType<typeof VideoPlayer> | null>(null);

function fullPlaybackUrl(video: VideoAssetDto): string {
  return `${API_ORIGIN}${video.playbackUrl}`;
}

function pollUntilSettled(assetId: string) {
  if (statusPollTimer) clearInterval(statusPollTimer);
  statusPollTimer = setInterval(async () => {
    const { video } = await videosApi.getStatus(assetId);
    videoAsset.value = video;
    if (video.status === "ready" || video.status === "failed") {
      if (statusPollTimer) clearInterval(statusPollTimer);
    }
  }, 2000);
}

async function submitVideo() {
  addingVideo.value = true;
  addVideoError.value = null;
  try {
    const { video } = await videosApi.add(roomId, { sourceUrl: sourceUrlInput.value });
    videoAsset.value = video;
    sourceUrlInput.value = "";
    if (video.status !== "ready" && video.status !== "failed") pollUntilSettled(video.id);
  } catch {
    addVideoError.value = "Не удалось добавить видео — проверьте ссылку";
  } finally {
    addingVideo.value = false;
  }
}

onMounted(async () => {
  // Anyone with a valid account and the room link joins automatically — sharing the URL *is*
  // the invite mechanism (see rooms.service.ts's `join`, idempotent for existing members). Without
  // this, only the creator could ever be a member and the whole "watch together" premise breaks.
  await roomsApi.join(roomId);
  await player.enterRoom(roomId);
  await chat.enterRoom(roomId);

  const { video } = await videosApi.latestForRoom(roomId);
  if (video) {
    videoAsset.value = video;
    if (video.status !== "ready" && video.status !== "failed") pollUntilSettled(video.id);
  }

  tickTimer = setInterval(() => {
    displaySeconds.value = player.getDisplayPositionSec();
    playerRef.value?.applyCorrection(displaySeconds.value);
    playerRef.value?.setPlaying(player.playback.status === "playing");
  }, 200);
});

onUnmounted(() => {
  if (tickTimer) clearInterval(tickTimer);
  if (statusPollTimer) clearInterval(statusPollTimer);
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

function submitChatMessage() {
  chat.send(chatInput.value);
  chatInput.value = "";
}

function togglePlay() {
  const userId = auth.user!.id;
  if (player.playback.status === "playing") {
    player.pause(userId);
  } else {
    player.play(userId);
  }
}

function leave() {
  router.push("/");
}
</script>

<template>
  <main class="room">
    <button class="back" @click="leave">← К списку комнат</button>

    <VideoPlayer v-if="videoAsset?.status === 'ready'" ref="playerRef" :src="fullPlaybackUrl(videoAsset)" />

    <form v-else-if="!videoAsset || videoAsset.status === 'failed'" class="add-video" @submit.prevent="submitVideo">
      <input
        v-model="sourceUrlInput"
        type="url"
        required
        placeholder="Прямая ссылка на .mp4 или .m3u8"
      />
      <button type="submit" :disabled="addingVideo">Добавить видео</button>
      <p v-if="videoAsset?.status === 'failed'" class="error">{{ videoAsset.failureReason }}</p>
      <p v-if="addVideoError" class="error">{{ addVideoError }}</p>
    </form>

    <p v-else class="preparing">
      Готовим видео на сервере ({{ videoAsset.status }})… обычно занимает несколько секунд.
    </p>

    <!--
      Debug readout, not just for looks: this is the same server-authoritative position the
      video element is being corrected against — with two tabs open, both numbers (and both
      videos, once one is loaded) stay in lockstep.
    -->
    <div class="fake-timer">{{ displaySeconds.toFixed(2) }}s</div>
    <p class="status">{{ player.playback.status === "playing" ? "▶ идёт" : "⏸ пауза" }}</p>

    <button class="toggle" @click="togglePlay">
      {{ player.playback.status === "playing" ? "Пауза" : "Play" }}
    </button>

    <section class="members">
      <h2>В комнате</h2>
      <ul>
        <li v-for="m in player.members" :key="m.userId">{{ m.displayName }}</li>
      </ul>
    </section>

    <section class="chat">
      <h2>Чат</h2>
      <div ref="chatLog" class="chat-log">
        <p v-for="m in chat.messages" :key="m.id" class="chat-message">
          <span class="chat-author">{{ m.displayName }}:</span> {{ m.body }}
        </p>
      </div>
      <form class="chat-form" @submit.prevent="submitChatMessage">
        <input v-model="chatInput" type="text" maxlength="2000" placeholder="Написать в чат…" />
        <button type="submit" :disabled="!chatInput.trim()">Отправить</button>
      </form>
    </section>
  </main>
</template>

<style scoped>
.room {
  max-width: 640px;
  margin: 2rem auto;
  padding: 0 1rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  align-items: center;
  text-align: center;
}
.back {
  align-self: flex-start;
  background: none;
  border: none;
  cursor: pointer;
  color: #567;
}
.add-video {
  width: 100%;
  display: flex;
  gap: 0.5rem;
}
.add-video input {
  flex: 1;
}
.preparing {
  color: #777;
}
.fake-timer {
  font-size: 2rem;
  font-variant-numeric: tabular-nums;
  color: #789;
}
.toggle {
  padding: 0.5rem 1.5rem;
}
.members {
  width: 100%;
}
.members ul {
  list-style: none;
  padding: 0;
}
.error {
  color: #d33;
  width: 100%;
}
.chat {
  width: 100%;
  text-align: left;
}
.chat-log {
  height: 220px;
  overflow-y: auto;
  border: 1px solid #cdd6e0;
  border-radius: 6px;
  padding: 0.5rem 0.75rem;
  background: #f7f9fb;
}
.chat-message {
  margin: 0.25rem 0;
  word-break: break-word;
}
.chat-author {
  font-weight: 600;
  color: #345;
}
.chat-form {
  margin-top: 0.5rem;
  display: flex;
  gap: 0.5rem;
}
.chat-form input {
  flex: 1;
}
</style>
