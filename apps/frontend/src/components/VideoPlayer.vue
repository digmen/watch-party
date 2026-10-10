<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from "vue";
import Hls from "hls.js";
import { computeDriftCorrection } from "../ws/clock-sync";

const props = defineProps<{ src: string; wantPlaying: boolean }>();
const emit = defineEmits<{ toggle: []; stall: [stalled: boolean] }>();
const videoEl = ref<HTMLVideoElement | null>(null);
let hls: Hls | null = null;

function attach(src: string) {
  const el = videoEl.value;
  if (!el) return;

  hls?.destroy();
  hls = null;

  if (Hls.isSupported()) {
    // The playlist can still be growing while people watch (the server starts serving the first
    // segments before the whole file is downloaded), and hls.js treats such a playlist as live and
    // jumps to its edge by default. A film must start at 0, and the room clock decides where we are.
    hls = new Hls({
      startPosition: 0,
      liveDurationInfinity: false,
      backBufferLength: 90,
      // Keep a long runway ahead: a viewer on a shaky connection survives a dip instead of freezing.
      maxBufferLength: 60,
      maxMaxBufferLength: 180,
      // Segments are membership-gated by the session cookie. Same-origin in production this is
      // implicit, but a cross-origin API (local dev, a future separate API host) silently drops
      // cookies on XHR unless asked — and every playlist request comes back 401.
      xhrSetup: (xhr) => {
        xhr.withCredentials = true;
      },
    });
    hls.on(Hls.Events.ERROR, (_event, data) => {
      if (!data.fatal) return;
      if (data.type === Hls.ErrorTypes.NETWORK_ERROR) hls?.startLoad();
      else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) hls?.recoverMediaError();
    });
    hls.loadSource(src);
    hls.attachMedia(el);
  } else if (el.canPlayType("application/vnd.apple.mpegurl")) {
    // Safari plays HLS natively — no hls.js needed there.
    el.src = src;
  }
}

// --- "no picture, no playback" -------------------------------------------------------------
// A stall is reported when the playhead has caught up with the buffer *during* playback, and
// cleared only once a few seconds are buffered again (hysteresis, so it does not flap). The server
// holds the whole room paused while anyone is stalled, so nobody sees time run on a frozen frame.
const STALL_BELOW_SEC = 0.4;
const RECOVER_ABOVE_SEC = 4;
let stalledReported = false;
let hasPlayed = false;
let stallTimer: ReturnType<typeof setInterval> | null = null;

function secondsBuffered(el: HTMLVideoElement): number {
  const t = el.currentTime;
  for (let i = 0; i < el.buffered.length; i++) {
    if (t >= el.buffered.start(i) - 0.1 && t <= el.buffered.end(i)) return el.buffered.end(i) - t;
  }
  return 0;
}

function checkStall() {
  const el = videoEl.value;
  if (!el) return;
  if (!el.paused && el.readyState >= 3 && el.currentTime > 0) hasPlayed = true;
  const ahead = secondsBuffered(el);
  const finished = el.duration > 0 && el.currentTime >= el.duration - 1.2 && !hlsStillGrowing();

  if (!stalledReported) {
    // Only mid-playback: a viewer who is still loading the first frames must not freeze a room
    // that is already running.
    if (props.wantPlaying && hasPlayed && !finished && ahead < STALL_BELOW_SEC) {
      stalledReported = true;
      emit("stall", true);
    }
  } else if (ahead >= RECOVER_ABOVE_SEC || finished) {
    stalledReported = false;
    emit("stall", false);
  }
}

// An event playlist that has not been closed yet is still being downloaded: being at its edge is
// a real stall, not the end of the film.
function hlsStillGrowing(): boolean {
  const live = hls?.levels?.[hls.currentLevel]?.details?.live;
  return live === true;
}

onMounted(() => {
  attach(props.src);
  stallTimer = setInterval(checkStall, 400);
});
watch(
  () => props.src,
  (next) => {
    hasPlayed = false;
    attach(next);
  },
);
onUnmounted(() => {
  if (stallTimer) clearInterval(stallTimer);
  if (stalledReported) emit("stall", false);
  hls?.destroy();
});

// Absolute value (not the video element's own currentTime) so the same idempotent correction
// can be re-applied every tick without drifting from repeated relative adjustments.
function applyCorrection(expectedSec: number) {
  const el = videoEl.value;
  if (!el || Number.isNaN(el.currentTime)) return;
  const correction = computeDriftCorrection(el.currentTime, expectedSec);
  if (correction.action === "seek") el.currentTime = expectedSec;
  else if (correction.action === "nudge") el.playbackRate = correction.rate;
  else el.playbackRate = 1;
}

function setPlaying(playing: boolean) {
  const el = videoEl.value;
  if (!el) return;
  if (playing && el.paused) el.play().catch(() => {});
  if (!playing && !el.paused) el.pause();
}

function getDuration(): number {
  const d = videoEl.value?.duration;
  return d && Number.isFinite(d) ? d : 0;
}

function setVolume(volume: number, muted: boolean) {
  const el = videoEl.value;
  if (!el) return;
  el.volume = volume;
  el.muted = muted;
}

defineExpose({ applyCorrection, setPlaying, getDuration, setVolume });
</script>

<template>
  <!-- Native controls are off on purpose: its seek bar would move only this viewer and the room clock would snap them back. -->
  <video ref="videoEl" class="video" playsinline @click="emit('toggle')"></video>
</template>

<style scoped>
.video {
  width: 100%;
  max-height: 70vh;
  aspect-ratio: 16 / 9;
  background: #000;
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow);
  cursor: pointer;
}
</style>
