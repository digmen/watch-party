import { onBeforeUnmount, onMounted, type Ref, watch } from "vue";

// Writes the height of what the person can actually see into `--room-h` on the given element.
//
// `100dvh` does not shrink when the on-screen keyboard opens (iOS Safari, and Chrome on Android by
// default): a full-height room would leave the chat input under the keyboard. The visual viewport
// does shrink, so the room sizes itself from it. While the page is pinch-zoomed the visual viewport
// is small for a different reason, and the CSS fallback (100dvh) is used instead.
export function useVisibleHeight(target: Ref<HTMLElement | null>): void {
  const vv = typeof window !== "undefined" ? window.visualViewport : null;

  function apply() {
    const el = target.value;
    if (!el) return;
    if (!vv || Math.abs(vv.scale - 1) > 0.01) {
      el.style.removeProperty("--room-h");
      return;
    }
    el.style.setProperty("--room-h", `${Math.round(vv.height)}px`);
  }

  onMounted(() => {
    vv?.addEventListener("resize", apply);
    vv?.addEventListener("scroll", apply);
    apply();
  });
  // The room element appears only once the socket has joined, after mount.
  watch(target, apply, { flush: "post" });
  onBeforeUnmount(() => {
    vv?.removeEventListener("resize", apply);
    vv?.removeEventListener("scroll", apply);
  });
}
