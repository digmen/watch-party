<script setup lang="ts">
import type { RoomDto } from "@watch-party/shared";
import { useRoomSettings } from "../../composables/useRoomSettings";

// Owner-only: who can reach the room and who may queue videos. Mounted once, when the room opens,
// so a half-edited form survives closing and reopening the panel.
const props = defineProps<{ roomId: string; room: RoomDto | null; closable?: boolean }>();
const emit = defineEmits<{ saved: [room: RoomDto]; close: [] }>();

const { visibility, queuePolicy, password, saving, message, save, removePassword } = useRoomSettings(
  props.roomId,
  props.room,
  (room) => emit("saved", room),
);
</script>

<template>
  <section class="settings" aria-label="Настройки комнаты">
    <h2>Доступ к комнате</h2>
    <div class="group">
      <label class="opt">
        <input v-model="visibility" type="radio" value="private" />
        <span><b>По ссылке</b> Только те, у кого есть ссылка.</span>
      </label>
      <label class="opt">
        <input v-model="visibility" type="radio" value="public" />
        <span><b>Публичная</b> Видна в списке публичных комнат.</span>
      </label>
    </div>
    <fieldset class="group policy">
      <legend>Кто добавляет видео в очередь</legend>
      <label class="opt">
        <input v-model="queuePolicy" type="radio" value="everyone" />
        <span><b>Все в комнате</b> Любой участник может поставить видео в очередь.</span>
      </label>
      <label class="opt">
        <input v-model="queuePolicy" type="radio" value="owner" />
        <span><b>Только хозяин</b> Остальные только смотрят.</span>
      </label>
    </fieldset>
    <div class="pw-row">
      <input
        v-model="password"
        type="text"
        maxlength="72"
        autocomplete="off"
        :placeholder="room?.hasPassword ? 'Новый пароль (пусто — не менять)' : 'Пароль (необязательно)'"
        aria-label="Пароль комнаты"
      />
      <button v-if="room?.hasPassword" class="ghost" :disabled="saving" @click="removePassword">Убрать пароль</button>
    </div>
    <div class="row">
      <button :disabled="saving" @click="save">{{ saving ? "Сохраняем…" : "Сохранить" }}</button>
      <button v-if="closable" class="quiet" @click="emit('close')">Закрыть</button>
      <span v-if="message" class="saved" role="status">{{ message }}</span>
    </div>
  </section>
</template>

<style scoped>
.settings {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  padding: var(--space-4);
  padding-bottom: max(var(--space-4), env(safe-area-inset-bottom));
  background: var(--color-surface);
  overflow-y: auto;
  overscroll-behavior: contain;
}
h2 {
  font-size: var(--text-lg);
}
.group {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
.opt {
  display: flex;
  gap: var(--space-3);
  align-items: flex-start;
  padding: var(--space-3);
  min-height: 2.75rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  background: var(--color-surface-raised);
  cursor: pointer;
  transition: border-color var(--transition);
}
.opt:has(input:checked) {
  border-color: var(--color-accent-line);
  background: var(--color-accent-soft);
}
.opt input {
  flex: none;
  margin-top: 0.2rem;
}
.opt b {
  display: block;
  color: var(--color-text);
}
.opt span {
  color: var(--color-text-muted);
  font-size: var(--text-sm);
}
.policy {
  border: none;
  padding: 0;
}
.policy legend {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
  margin-bottom: var(--space-2);
}
.pw-row,
.row {
  display: flex;
  gap: var(--space-2);
  flex-wrap: wrap;
  align-items: center;
}
.pw-row input {
  flex: 1;
  min-width: min(14rem, 100%);
}
.saved {
  color: var(--color-success);
  font-size: var(--text-sm);
}
</style>
