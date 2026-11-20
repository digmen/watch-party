import { createHead } from "@unhead/vue/client";
import { createPinia } from "pinia";
import { createApp } from "vue";
import App from "./App.vue";
import router from "./router";
import "@fontsource-variable/manrope";
import "@fontsource-variable/unbounded";
import "./styles/base.css";

const app = createApp(App);
app.use(createPinia());
app.use(createHead());
app.use(router);
app.mount("#app");
