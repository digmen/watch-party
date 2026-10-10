import { createRouter, createWebHistory } from "vue-router";
import { hasSessionHint } from "../api/client";
import { useAuthStore } from "../stores/auth.store";
import AboutView from "../views/AboutView.vue";
import LandingView from "../views/LandingView.vue";
import LegalView from "../views/LegalView.vue";
import LoginView from "../views/LoginView.vue";
import NotFoundView from "../views/NotFoundView.vue";
import RoomCreateView from "../views/RoomCreateView.vue";
import RoomListView from "../views/RoomListView.vue";
import RoomPlayerView from "../views/RoomPlayerView.vue";

const router = createRouter({
  history: createWebHistory(),
  scrollBehavior: (_to, _from, saved) => saved ?? { top: 0 },
  routes: [
    { path: "/", name: "landing", component: LandingView },
    { path: "/about", name: "about", component: AboutView },
    { path: "/login", name: "login", component: LoginView },
    { path: "/privacy", name: "privacy", component: LegalView },
    { path: "/terms", name: "terms", component: LegalView },
    { path: "/rooms", name: "rooms", component: RoomListView, meta: { requiresAuth: true, requiresFullAccount: true } },
    {
      path: "/rooms/new",
      name: "room-create",
      component: RoomCreateView,
      meta: { requiresAuth: true, requiresFullAccount: true },
    },
    // Deliberately public at the router level: the room UUID is the invite credential, and the
    // view itself gates behind the guest name prompt until a session exists. Requiring auth here
    // is what used to bounce invited friends to a login form they had no account for.
    { path: "/rooms/:id", name: "room-player", component: RoomPlayerView },
    { path: "/:pathMatch(.*)*", name: "not-found", component: NotFoundView },
  ],
});

router.beforeEach(async (to) => {
  const auth = useAuthStore();

  // Only probe the session when there's a reason to think one exists. The old unconditional
  // fetch fired /auth/me on every cold load — including the login page and, now, the public
  // landing page — producing a guaranteed 401 (and a second one from the refresh retry) in the
  // console of every first-time visitor.
  if (auth.status === "idle" && hasSessionHint()) {
    await auth.fetchCurrentUser();
  }

  if (to.meta.requiresAuth && !auth.isAuthenticated) {
    return { name: "login" };
  }

  // Guests have no room list and can't create rooms — send them back to the one room they belong
  // to. Aborting (`false`) rather than redirecting to /login avoids an infinite bounce off the
  // rule below when a guest somehow has no room id.
  if (to.meta.requiresFullAccount && auth.isGuest) {
    return auth.guestRoomId ? { name: "room-player", params: { id: auth.guestRoomId } } : false;
  }

  if (to.name === "login" && auth.isAuthenticated) {
    return auth.isGuest && auth.guestRoomId
      ? { name: "room-player", params: { id: auth.guestRoomId } }
      : { name: "rooms" };
  }

  return true;
});

export default router;
