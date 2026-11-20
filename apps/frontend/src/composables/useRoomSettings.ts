import type { RoomDto } from "@watch-party/shared";
import { ref } from "vue";
import { roomsApi } from "../api/rooms.api";

// Owner's room settings form: visibility, who may queue videos, password.
// Starts from the room as it was when joined; `onSaved` hands back the server's updated room.
export function useRoomSettings(roomId: string, initial: RoomDto | null, onSaved: (room: RoomDto) => void) {
  const visibility = ref<"public" | "private">(initial?.visibility ?? "private");
  const queuePolicy = ref<"everyone" | "owner">(initial?.queueAddPolicy ?? "everyone");
  const password = ref("");
  const saving = ref(false);
  const message = ref<string | null>(null);

  async function save() {
    saving.value = true;
    message.value = null;
    try {
      const dto: { visibility: "public" | "private"; password?: string | null; queueAddPolicy: "everyone" | "owner" } =
        {
          visibility: visibility.value,
          queueAddPolicy: queuePolicy.value,
        };
      if (password.value) dto.password = password.value;
      const { room } = await roomsApi.update(roomId, dto);
      onSaved(room);
      password.value = "";
      message.value = "Сохранено";
    } catch {
      message.value = "Не удалось сохранить";
    } finally {
      saving.value = false;
    }
  }

  async function removePassword() {
    saving.value = true;
    try {
      const { room } = await roomsApi.update(roomId, { password: null });
      onSaved(room);
      message.value = "Пароль убран";
    } catch {
      message.value = "Не удалось сохранить";
    } finally {
      saving.value = false;
    }
  }

  return { visibility, queuePolicy, password, saving, message, save, removePassword };
}
