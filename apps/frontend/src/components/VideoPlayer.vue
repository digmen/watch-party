<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from "vue";
import Hls from "hls.js";
import { computeDriftCorrection } from "../ws/clock-sync";

const props = defineProps<{ src: string }>();
const videoEl = ref<HTMLVideoElement | null>(null);
let hls: Hls | null = null;

function attach(src: string) {
  const el = videoEl.value;
  if (!el) return;

  hls?.destroy();
  hls = null;

  if (Hls.isSupported()) {
    hls = new Hls();
    hls.loadSource(src);
    hls.attachMedia(el);
  } else if (el.canPlayType("application/vnd.apple.mpegurl")) {
    // Safari plays HLS natively — no hls.js needed there.
    el.src = src;
  }
}

onMounted(() => attach(props.src));
watch(() => props.src, (next) => attach(next));
onUnmounted(() => hls?.destroy());

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

defineExpose({ applyCorrection, setPlaying });
</script>

<template>
  <video ref="videoEl" class="video" controls playsinline></video>
</template>

<style scoped>
.video {
  width: 100%;
  max-height: 70vh;
  aspect-ratio: 16 / 9;
  background: #000;
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow);
}
</style>
