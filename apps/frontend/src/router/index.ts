import { createRouter, createWebHistory } from "vue-router";
import { useAuthStore } from "../stores/auth.store";
import LoginView from "../views/LoginView.vue";
import RoomCreateView from "../views/RoomCreateView.vue";
import RoomListView from "../views/RoomListView.vue";
import RoomPlayerView from "../views/RoomPlayerView.vue";

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/login", name: "login", component: LoginView },
    { path: "/", name: "rooms", component: RoomListView, meta: { requiresAuth: true } },
    { path: "/rooms/new", name: "room-create", component: RoomCreateView, meta: { requiresAuth: true } },
    { path: "/rooms/:id", name: "room-player", component: RoomPlayerView, meta: { requiresAuth: true } },
  ],
});

router.beforeEach(async (to) => {
  const auth = useAuthStore();
  if (auth.status === "idle") {
    await auth.fetchCurrentUser();
  }

  if (to.meta.requiresAuth && !auth.isAuthenticated) {
    return { name: "login" };
  }
  if (to.name === "login" && auth.isAuthenticated) {
    return { name: "rooms" };
  }
  return true;
});

export default router;
