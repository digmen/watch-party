import { onBeforeUnmount, type Ref, ref } from "vue";

// Live `matchMedia` result. Used where the DOM must differ by breakpoint (ARIA tabs exist only on
// phones), not for styling — styling stays in CSS media queries.
export function useMediaQuery(query: string): Ref<boolean> {
  const mql =
    typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia(query) : null;
  const matches = ref(mql?.matches ?? false);
  const onChange = (event: MediaQueryListEvent) => {
    matches.value = event.matches;
  };
  mql?.addEventListener("change", onChange);
  onBeforeUnmount(() => mql?.removeEventListener("change", onChange));
  return matches;
}
