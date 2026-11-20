import { ref } from "vue";

// "Пригласить": copies the room link and shows "copied" for two seconds.
export function useCopyLink(url: () => string) {
  const copied = ref(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url());
      copied.value = true;
      setTimeout(() => {
        copied.value = false;
      }, 2000);
    } catch {
      // Clipboard can be refused (insecure context, permissions); the address bar still has the link.
    }
  }

  return { copied, copy };
}
