import type { UserDto } from "@watch-party/shared";
import { defineStore } from "pinia";
import { authApi } from "../api/auth.api";
import { ApiError } from "../api/client";

interface AuthState {
  user: UserDto | null;
  status: "idle" | "loading" | "ready";
  error: string | null;
}

export const useAuthStore = defineStore("auth", {
  state: (): AuthState => ({ user: null, status: "idle", error: null }),

  getters: {
    isAuthenticated: (state) => state.user !== null,
    isGuest: (state) => state.user?.isGuest === true,
    // The one room a guest is scoped to. Null for full accounts, who aren't scoped at all.
    guestRoomId: (state) => state.user?.guestRoomId ?? null,
  },

  actions: {
    async fetchCurrentUser() {
      this.status = "loading";
      try {
        const { user } = await authApi.me();
        this.user = user;
      } catch {
        this.user = null;
      } finally {
        this.status = "ready";
      }
    },

    async register(email: string, password: string) {
      this.error = null;
      try {
        const { user } = await authApi.register({ email, password });
        this.user = user;
      } catch (err) {
        this.error = err instanceof ApiError ? err.message : "Registration failed";
        throw err;
      }
    },

    async login(email: string, password: string) {
      this.error = null;
      try {
        const { user } = await authApi.login({ email, password });
        this.user = user;
      } catch (err) {
        this.error = err instanceof ApiError ? err.message : "Login failed";
        throw err;
      }
    },

    async joinAsGuest(roomId: string, displayName: string) {
      this.error = null;
      try {
        const { user } = await authApi.joinAsGuest({ roomId, displayName });
        this.user = user;
        this.status = "ready";
      } catch (err) {
        this.error = err instanceof ApiError ? err.message : "Не удалось войти как гость";
        throw err;
      }
    },

    async logout() {
      await authApi.logout();
      this.user = null;
    },
  },
});
