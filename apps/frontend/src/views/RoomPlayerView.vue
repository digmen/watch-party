<script setup lang="ts">
import type { RoomDto, VideoAssetDto } from "@watch-party/shared";
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { API_ORIGIN } from "../api/client";
import GuestJoinPrompt from "../components/GuestJoinPrompt.vue";
import AddVideoCard from "../components/room/AddVideoCard.vue";
import ChatPanel from "../components/room/ChatPanel.vue";
import PlayerStage from "../components/room/PlayerStage.vue";
import QueuePanel from "../components/room/QueuePanel.vue";
import RoomGate from "../components/room/RoomGate.vue";
import RoomSettingsPanel from "../components/room/RoomSettingsPanel.vue";
import RoomTabs, { type RoomTab } from "../components/room/RoomTabs.vue";
import RoomTopBar from "../components/room/RoomTopBar.vue";
import StagePlaceholder from "../components/room/StagePlaceholder.vue";
import { useCopyLink } from "../composables/useCopyLink";
import { useMediaQuery } from "../composables/useMediaQuery";
import { useRoomAccess } from "../composables/useRoomAccess";
import { useRoomPlayback } from "../composables/useRoomPlayback";
import { useRoomPresence } from "../composables/useRoomPresence";
import { useRoomVideo } from "../composables/useRoomVideo";
import { useVisibleHeight } from "../composables/useVisibleHeight";
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

const stageRef = ref<InstanceType<typeof PlayerStage> | null>(null);
const queuePanel = ref<InstanceType<typeof QueuePanel> | null>(null);

const video = useRoomVideo(roomId);
const { videoAsset } = video;
const playback = useRoomPlayback({
  stage: stageRef,
  isVideoReady: () => videoAsset.value?.status === "ready",
  onTick: video.tickPreparing,
});
const access = useRoomAccess(roomId, {
  afterSocket: async () => {
    await video.attach();
    playback.startTick();
  },
});
const { roomInfo } = access;
const { notices, alone, typingNames } = useRoomPresence();
const roomUrl = computed(() => `${window.location.origin}/rooms/${roomId}`);
const { copied, copy: copyRoomLink } = useCopyLink(() => roomUrl.value);

const isRoomOwner = computed(() => access.roomOwnerId.value !== null && access.roomOwnerId.value === auth.user?.id);
// Invited guests watch what the host picked. A guest who *started* the room is its host and may
// pick the video — the backend enforces the same rule on addVideo; this keeps the UI honest.
// Who may add to the queue is the owner's call (room setting); the owner always may.
const canAddVideo = computed(
  () => auth.isAuthenticated && (isRoomOwner.value || roomInfo.value?.queueAddPolicy !== "owner"),
);
// Nothing to watch yet (or the current video could not be prepared): the big "what do we watch" card.
const showAddVideo = computed(() => canAddVideo.value && (!videoAsset.value || videoAsset.value.status === "failed"));
const isPreparing = computed(() => videoAsset.value?.status === "pending" || videoAsset.value?.status === "processing");

function fullPlaybackUrl(asset: VideoAssetDto): string {
  return `${API_ORIGIN}${asset.playbackUrl}`;
}

// --- layout -------------------------------------------------------------------------------
// Desktop/tablet landscape: video + queue on the left, chat on the right, both always visible.
// Phone and tablet portrait: the video stays pinned on top, the rest is one panel at a time.
const isWide = useMediaQuery("(min-width: 56rem)");
const isPhoneLandscape = useMediaQuery("(max-width: 55.99rem) and (orientation: landscape) and (max-height: 32rem)");
const roomEl = ref<HTMLElement | null>(null);
useVisibleHeight(roomEl);

type Tab = "chat" | "queue" | "settings";
const tab = ref<Tab>("chat");
// The queue tab only exists once there is a video; never leave the person on a tab that vanished.
const activeTab = computed<Tab>(() => {
  if (tab.value === "queue" && !videoAsset.value) return "chat";
  if (tab.value === "settings" && !isRoomOwner.value) return "chat";
  return tab.value;
});
const chatVisible = computed(() => (isWide.value ? activeTab.value !== "settings" : activeTab.value === "chat"));
const queueVisible = computed(() => isWide.value || activeTab.value === "queue");
const settingsVisible = computed(() => isRoomOwner.value && activeTab.value === "settings");

// Messages that arrived while the chat was not on screen.
const unreadChat = ref(0);
watch(
  () => chat.messages.length,
  (now, before) => {
    if (!chatVisible.value) unreadChat.value += Math.max(0, now - before);
  },
);
watch(chatVisible, (visible) => {
  if (visible) unreadChat.value = 0;
});

const tabs = computed<RoomTab[]>(() => {
  const list: RoomTab[] = [{ id: "chat", label: "Чат", badge: unreadChat.value }];
  if (videoAsset.value) {
    list.push({ id: "queue", label: "Очередь", badge: player.queue.filter((i) => i.status === "queued").length });
  }
  if (isRoomOwner.value) list.push({ id: "settings", label: "Настройки" });
  return list;
});

function panelAttrs(id: Tab) {
  if (isWide.value) return {};
  return { id: `room-panel-${id}`, role: "tabpanel", "aria-labelledby": `room-tab-${id}` };
}

function toggleSettings() {
  tab.value = activeTab.value === "settings" ? "chat" : "settings";
}

async function openAddVideo() {
  if (!isWide.value) tab.value = "queue";
  await nextTick();
  queuePanel.value?.focusInput();
}

function onSettingsSaved(room: RoomDto) {
  roomInfo.value = room;
}

onMounted(() => access.start());
// Registered after the composables, so their timers are already stopped when the room is left.
onUnmounted(() => {
  player.leaveRoom();
  chat.leaveRoom();
});

function leave() {
  router.push(auth.isGuest ? "/" : "/rooms");
}
</script>

<template>
  <RoomGate v-if="access.notFound.value" kind="not-found" />

  <GuestJoinPrompt
    v-else-if="!auth.isAuthenticated"
    :submitting="access.entering.value"
    :error="auth.error"
    :requires-password="access.requiresPassword.value"
    @submit="access.handleGuestJoin"
  />

  <RoomGate
    v-else-if="access.passwordPrompt.value"
    kind="password"
    :busy="access.entering.value"
    :error="access.passwordError.value"
    @submit-password="access.submitPassword"
  />

  <RoomGate v-else-if="access.enterError.value" kind="error" :error="access.enterError.value" />

  <RoomGate v-else-if="!access.entered.value" kind="entering" />

  <div v-else ref="roomEl" class="room" :class="{ wide: isWide, landscape: isPhoneLandscape }">
    <RoomTopBar
      :name="roomInfo?.name ?? ''"
      :visibility="roomInfo?.visibility ?? 'private'"
      :has-password="roomInfo?.hasPassword ?? false"
      :members="player.members"
      :can-manage="canAddVideo && !showAddVideo"
      :is-owner="isRoomOwner"
      :copied="copied"
      :back-label="auth.isGuest ? 'На главную' : 'К комнатам'"
      :settings-active="settingsVisible"
      @back="leave"
      @copy="copyRoomLink"
      @add-video="openAddVideo"
      @settings="toggleSettings"
    />

    <div class="layout">
      <div class="main">
        <div class="stage-slot">
          <AddVideoCard
            v-if="showAddVideo"
            :busy="video.addingVideo.value"
            :error="video.addVideoError.value ?? (videoAsset?.status === 'failed' ? videoAsset.failureReason : null)"
            :hero="!videoAsset || videoAsset.status === 'failed'"
            :can-cancel="false"
            @submit="video.submitVideo"
          />

          <PlayerStage
            v-else-if="videoAsset?.status === 'ready'"
            ref="stageRef"
            :src="fullPlaybackUrl(videoAsset)"
            :asset-id="videoAsset.id"
            :playing="playback.intendsToPlay.value"
            :position-sec="playback.displaySeconds.value"
            :waiting-for="player.waitingFor"
            :title="videoAsset.title"
            :recent="chat.messages"
            :self-id="auth.user?.id ?? null"
            :overlay-chat="isPhoneLandscape"
            @toggle="playback.togglePlay"
            @seek="playback.seekTo"
            @stall="player.reportStall"
            @send="chat.send"
            @ready="player.reportReady"
            @ended="player.reportEnded(videoAsset.id)"
          />

          <StagePlaceholder v-else-if="isPreparing" kind="preparing" :preparing-seconds="video.preparingSeconds.value" />
          <StagePlaceholder v-else-if="videoAsset?.status === 'failed'" kind="failed" :reason="videoAsset.failureReason" />
          <StagePlaceholder v-else kind="waiting" />
        </div>

        <QueuePanel
          v-if="videoAsset"
          v-show="queueVisible"
          ref="queuePanel"
          v-bind="panelAttrs('queue')"
          class="panel queue-slot"
          :flat="!isWide"
          :items="player.queue"
          :can-add="canAddVideo"
          :is-owner="isRoomOwner"
          :self-id="auth.user?.id ?? null"
          :busy="video.addingVideo.value"
          :error="video.queueError.value"
          @add="video.submitVideo"
          @play="video.playQueueItem"
          @remove="video.removeQueueItem"
          @reorder="video.reorderQueue"
          @next="video.nextInQueue"
        />
      </div>

      <div class="side">
        <RoomTabs v-if="!isWide" v-model="tab" class="tabs-slot" :tabs="tabs" id-prefix="room" />

        <ChatPanel
          v-show="chatVisible"
          v-bind="panelAttrs('chat')"
          class="panel chat-slot"
          :bare="!isWide"
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

        <RoomSettingsPanel
          v-if="isRoomOwner"
          v-show="settingsVisible"
          v-bind="panelAttrs('settings')"
          class="panel settings-slot"
          :room-id="roomId"
          :room="roomInfo"
          :closable="isWide"
          @saved="onSettingsSaved"
          @close="tab = 'chat'"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
/*
 * Three layouts, one DOM:
 *  - phone / tablet portrait: video pinned on top, tab bar, one panel filling the rest;
 *  - phone landscape: the picture takes the whole screen (chat floats over it), panels below;
 *  - ≥56rem: video + queue on the left, chat on the right.
 * `--room-h` is the visible height (shrinks with the on-screen keyboard), see useVisibleHeight.
 */
.room {
  display: flex;
  flex-direction: column;
  height: var(--room-h, 100dvh);
  overflow: hidden;
  background: var(--color-bg);
}

/* --- phone / tablet portrait (default) --- */
.layout {
  --stage-max-h: calc(var(--room-h, 100dvh) * 0.42);
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr);
  grid-template-columns: minmax(0, 1fr);
  grid-template-areas: "stage" "tabs" "panel";
}
.main,
.side {
  display: contents;
}
.stage-slot {
  grid-area: stage;
  min-width: 0;
  display: flex;
  justify-content: center;
  background: #000;
}
.stage-slot:has(.add) {
  background: transparent;
}
.tabs-slot {
  grid-area: tabs;
}
.panel {
  grid-area: panel;
  min-height: 0;
  min-width: 0;
}
.queue-slot,
.settings-slot {
  overflow-y: auto;
  overscroll-behavior: contain;
  padding-bottom: max(var(--space-4), env(safe-area-inset-bottom));
}

/* --- phone landscape: picture first and as big as the screen; scroll down for the rest --- */
.room.landscape {
  overflow-y: auto;
  scroll-snap-type: y proximity;
}
.room.landscape .layout {
  --stage-max-h: var(--room-h, 100dvh);
  display: contents;
}
.room.landscape .stage-slot {
  order: -1;
  flex: none;
  height: var(--room-h, 100dvh);
  align-items: center;
  scroll-snap-align: start;
  padding-inline: env(safe-area-inset-left) env(safe-area-inset-right);
}
.room.landscape .stage-slot:has(.add) {
  height: auto;
  min-height: var(--room-h, 100dvh);
}
.room.landscape :deep(.bar) {
  scroll-snap-align: start;
}
.room.landscape .tabs-slot {
  flex: none;
}
.room.landscape .panel {
  flex: none;
  /* Bar + tabs + panel = exactly one screen once scrolled past the picture. */
  height: calc(var(--room-h, 100dvh) - 3rem - 3.35rem);
}

/* --- desktop / tablet landscape --- */
.room.wide .layout {
  --stage-max-h: calc(var(--room-h, 100dvh) - 12rem);
  display: grid;
  grid-template-rows: minmax(0, 1fr);
  grid-template-columns: minmax(0, 1fr) 22rem;
  grid-template-areas: "main side";
}
.room.wide .main {
  grid-area: main;
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  min-width: 0;
  padding: var(--space-4) var(--space-5) var(--space-6);
  overflow-y: auto;
}
.room.wide .stage-slot {
  background: transparent;
}
.room.wide .side {
  grid-area: side;
  display: flex;
  flex-direction: column;
  min-height: 0;
  border-left: 1px solid var(--color-border);
  background: var(--color-surface);
}
.room.wide .panel {
  flex: 1;
}
.room.wide .queue-slot {
  flex: none;
  overflow: visible;
  padding-bottom: var(--space-4);
}
@media (min-width: 90rem) {
  .room.wide .layout {
    grid-template-columns: minmax(0, 1fr) 26rem;
  }
}
</style>
