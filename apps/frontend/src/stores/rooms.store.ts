import type { RoomDto } from "@watch-party/shared";
import { defineStore } from "pinia";
import { roomsApi } from "../api/rooms.api";

interface RoomsState {
  rooms: RoomDto[];
  loading: boolean;
}

export const useRoomsStore = defineStore("rooms", {
  state: (): RoomsState => ({ rooms: [], loading: false }),

  actions: {
    async fetchRooms() {
      this.loading = true;
      try {
        const { rooms } = await roomsApi.list();
        this.rooms = rooms;
      } finally {
        this.loading = false;
      }
    },

    async createRoom(name: string, visibility: "public" | "private" = "private", password?: string): Promise<RoomDto> {
      const { room } = await roomsApi.create({ name, visibility, password: password || undefined });
      this.rooms.push(room);
      return room;
    },
  },
});
