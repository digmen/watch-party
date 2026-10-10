import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [vue()],
  // Every browser we care about runs ES2022 natively; the default target ships needless polyfills.
  build: { target: "es2022" },
  server: {
    port: 5173,
  },
});
