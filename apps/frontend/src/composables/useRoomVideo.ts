import type { VideoAssetDto } from "@watch-party/shared";
import { onUnmounted, ref } from "vue";
import { queueApi } from "../api/queue.api";
import { videosApi } from "../api/videos.api";
import { usePlayerStore } from "../stores/player.store";

// The room's current video and its queue: adding a link, following a video while the server
// prepares it, picking up a video someone else added, and the queue actions.
export function useRoomVideo(roomId: string) {
  const player = usePlayerStore();

  const videoAsset = ref<VideoAssetDto | null>(null);
  const addingVideo = ref(false);
  const addVideoError = ref<string | null>(null);
  const queueError = ref<string | null>(null);
  const preparingSince = ref<number>(0);
  const preparingSeconds = ref(0);

  let statusPollTimer: ReturnType<typeof setInterval> | null = null;
  let firstVideoTimer: ReturnType<typeof setInterval> | null = null;

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

  // Runs once the socket has joined the room (subscriptions need the socket to exist).
  async function attach() {
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
  }

  // Called from the playback tick (5 times a second).
  function tickPreparing() {
    if (preparingSince.value) preparingSeconds.value = Math.round((Date.now() - preparingSince.value) / 1000);
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

  onUnmounted(() => {
    if (firstVideoTimer) clearInterval(firstVideoTimer);
    firstVideoTimer = null;
    stopPolling();
  });

  return {
    videoAsset,
    addingVideo,
    addVideoError,
    queueError,
    preparingSeconds,
    attach,
    tickPreparing,
    submitVideo,
    playQueueItem,
    removeQueueItem,
    reorderQueue,
    nextInQueue,
  };
}
