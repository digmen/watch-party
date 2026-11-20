import { computed, onMounted, onUnmounted, type Ref, ref } from "vue";
import { useAuthStore } from "../stores/auth.store";
import { usePlayerStore } from "../stores/player.store";

// What the view needs from the on-screen player (PlayerStage's exposed methods).
export interface StageHandle {
  applyCorrection: (sec: number) => void;
  setPlaying: (playing: boolean) => void;
  refreshDuration: () => number;
  toggleFullscreen: () => void;
  toggleMute: () => void;
}

// The room clock → this screen: the 200 ms tick that keeps the local <video> on the room's
// position, play/pause/seek on behalf of this person, and the keyboard shortcuts.
export function useRoomPlayback(options: {
  stage: Ref<StageHandle | null>;
  // Shortcuts only work while a video is actually on screen.
  isVideoReady: () => boolean;
  // Extra work for the same tick (the "preparing for N s" counter).
  onTick?: () => void;
}) {
  const player = usePlayerStore();
  const auth = useAuthStore();

  const displaySeconds = ref(0);
  const isPlaying = computed(() => player.playback.status === "playing");
  // What the people in the room INTEND: while the room is held for someone's missing frames it is
  // "paused" on the server, but everyone's intent is still "playing" — and the one button must say
  // "pause" then. (It used to say ▶, so the host's click meant "play" and he could never stop it.)
  const intendsToPlay = computed(() => isPlaying.value || player.waitingFor.length > 0);

  let tickTimer: ReturnType<typeof setInterval> | null = null;

  function startTick() {
    tickTimer = setInterval(() => {
      displaySeconds.value = player.getDisplayPositionSec();
      options.stage.value?.applyCorrection(displaySeconds.value);
      options.stage.value?.setPlaying(isPlaying.value);
      options.stage.value?.refreshDuration();
      options.onTick?.();
    }, 200);
  }

  function togglePlay() {
    if (!auth.user) return;
    if (intendsToPlay.value) player.pause(auth.user.id);
    else player.play(auth.user.id);
  }

  function seekTo(sec: number) {
    if (!auth.user) return;
    const max = options.stage.value?.refreshDuration() || sec;
    player.seek(auth.user.id, Math.min(Math.max(0, sec), max));
  }

  // Space / K play-pause, arrows ±10 s, F fullscreen, M mute — but never while typing.
  function onKeydown(event: KeyboardEvent) {
    const target = event.target as HTMLElement | null;
    if (target && ["INPUT", "TEXTAREA", "BUTTON", "SELECT"].includes(target.tagName)) return;
    if (!options.isVideoReady()) return;
    const key = event.key.toLowerCase();
    if (event.key === " " || key === "k") {
      event.preventDefault();
      togglePlay();
    } else if (event.key === "ArrowRight") seekTo(displaySeconds.value + 10);
    else if (event.key === "ArrowLeft") seekTo(displaySeconds.value - 10);
    else if (key === "f") options.stage.value?.toggleFullscreen();
    else if (key === "m") options.stage.value?.toggleMute();
  }

  onMounted(() => window.addEventListener("keydown", onKeydown));
  onUnmounted(() => {
    window.removeEventListener("keydown", onKeydown);
    if (tickTimer) clearInterval(tickTimer);
  });

  return { displaySeconds, intendsToPlay, startTick, togglePlay, seekTo };
}
