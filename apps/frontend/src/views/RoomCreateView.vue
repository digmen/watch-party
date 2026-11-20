<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";
import { useRoomsStore } from "../stores/rooms.store";

const name = ref("");
const visibility = ref<"public" | "private">("private");
const password = ref("");
const submitting = ref(false);
const error = ref<string | null>(null);

const rooms = useRoomsStore();
const router = useRouter();

async function submit() {
  submitting.value = true;
  error.value = null;
  try {
    const room = await rooms.createRoom(name.value, visibility.value, password.value || undefined);
    router.push(`/rooms/${room.id}`);
  } catch {
    error.value = "Не удалось создать комнату";
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <main class="create">
    <RouterLink class="back" to="/rooms">← К списку комнат</RouterLink>

    <header class="page-head">
      <span class="eyebrow">Комната</span>
      <h1>Новая комната</h1>
      <p class="lede">Назовите её как угодно — название увидят те, кого вы позовёте.</p>
    </header>

    <form class="sheet" @submit.prevent="submit">
      <label class="field">
        <span class="field-label">Название</span>
        <input v-model="name" type="text" required maxlength="80" placeholder="Вечер пятницы" autofocus />
      </label>

      <fieldset class="vis">
        <legend class="field-label">Кто может зайти</legend>
        <div class="options">
          <label class="opt">
            <input v-model="visibility" type="radio" value="private" />
            <span class="opt-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" />
                <path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" />
              </svg>
            </span>
            <span class="opt-text">
              <b>По ссылке</b>
              <span>Только те, кому вы отправили ссылку.</span>
            </span>
          </label>
          <label class="opt">
            <input v-model="visibility" type="radio" value="public" />
            <span class="opt-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20" />
              </svg>
            </span>
            <span class="opt-text">
              <b>Публичная</b>
              <span>Видна в списке на главной, зайти может любой.</span>
            </span>
          </label>
        </div>
      </fieldset>

      <label class="field">
        <span class="field-label">Пароль <span class="opt-hint">необязательно</span></span>
        <input v-model="password" type="text" maxlength="72" autocomplete="off" placeholder="Без пароля — зайдёт любой со ссылкой" />
      </label>

      <p v-if="error" class="error" role="alert">{{ error }}</p>
      <button type="submit" class="submit" :disabled="submitting">{{ submitting ? "Создаём…" : "Создать" }}</button>
    </form>
  </main>
</template>

<style scoped>
.create {
  width: 100%;
  max-width: calc(36rem + 2 * var(--gutter));
  margin: 0 auto;
  padding: var(--space-6) var(--gutter) var(--space-12);
}

.back {
  display: inline-flex;
  align-items: center;
  min-height: 2.75rem;
  margin-bottom: var(--space-4);
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--color-text-muted);
  text-decoration: none;
}
.back:hover {
  color: var(--color-text);
}

.page-head {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin-bottom: var(--space-6);
}
h1 {
  font-size: var(--text-3xl);
}
.lede {
  color: var(--color-text-muted);
  max-width: 36rem;
}

.sheet {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
  padding: clamp(var(--space-4), 4vw, var(--space-6));
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-xl);
}

.field {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
.field-label {
  font-size: var(--text-sm);
  font-weight: 700;
  color: var(--color-text);
}
.opt-hint {
  margin-left: var(--space-1);
  font-weight: 500;
  color: var(--color-text-faint);
}

.vis {
  border: 0;
  padding: 0;
  min-width: 0;
}
.vis legend {
  padding: 0;
  margin-bottom: var(--space-2);
}
.options {
  display: grid;
  gap: var(--space-3);
}
@media (min-width: 560px) {
  .options {
    grid-template-columns: 1fr 1fr;
  }
}

/* Radio as a selectable tile: the whole card is the hit target, the checked one lights up amber. */
.opt {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
  min-height: 2.75rem;
  padding: var(--space-4);
  background: var(--color-surface-raised);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  cursor: pointer;
  transition:
    border-color var(--transition),
    background var(--transition),
    box-shadow var(--transition);
}
.opt:hover {
  border-color: var(--color-border-strong);
}
.opt:has(input:checked) {
  border-color: var(--color-accent-line);
  background: var(--color-accent-soft);
  box-shadow: inset 0 0 0 1px var(--color-accent-line);
}
.opt:has(input:focus-visible) {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}
.opt input {
  position: absolute;
  top: var(--space-4);
  right: var(--space-4);
  margin: 0;
}
.opt-icon {
  flex: none;
  display: grid;
  place-items: center;
  width: 2.5rem;
  height: 2.5rem;
  border-radius: var(--radius);
  background: var(--color-surface-hover);
  color: var(--color-text-muted);
  transition:
    background var(--transition),
    color var(--transition);
}
.opt:has(input:checked) .opt-icon {
  background: var(--color-accent);
  color: var(--color-accent-contrast);
}
.opt-text {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  padding-right: var(--space-5);
  font-size: var(--text-sm);
  color: var(--color-text-muted);
}
.opt-text b {
  font-size: var(--text-base);
  color: var(--color-text);
}

.submit {
  width: 100%;
  min-height: 3rem;
}
@media (min-width: 560px) {
  .submit {
    align-self: flex-end;
    width: auto;
    min-width: 12rem;
  }
}
</style>
