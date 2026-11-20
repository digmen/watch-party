<script setup lang="ts">
// A stylised, purely decorative copy of the room screen: player on the left, chat on the right.
// Drawn in CSS instead of a screenshot so it stays crisp, light and in the current palette.
const messages = [
  { who: "Аня", text: "ты видела эту сцену?", tone: "a1" },
  { who: "Макс", text: "ааа, сейчас будет 😂", tone: "a2" },
  { who: "Кира", text: "поставь на паузу, я за чаем", tone: "a3" },
];
</script>

<template>
  <div class="mock" aria-hidden="true">
    <div class="beam"></div>
    <div class="window">
      <div class="chrome">
        <span class="dots"><i></i><i></i><i></i></span>
        <span class="room-name">Пятничное кино</span>
        <span class="sync"><span class="pulse"></span>синхронно</span>
      </div>

      <div class="body">
        <div class="player">
          <div class="scene"></div>
          <div class="who">
            <b class="a1">А</b><b class="a2">М</b><b class="a3">К</b>
            <em>3 смотрят</em>
          </div>
          <div class="play">
            <svg viewBox="0 0 24 24" width="22" height="22"><path d="M8 5v14l11-7z" fill="currentColor" /></svg>
          </div>
          <div class="controls">
            <div class="bar"><span></span></div>
            <div class="time"><span>42:17</span><span>1:58:03</span></div>
          </div>
        </div>

        <div class="chat">
          <p v-for="m in messages" :key="m.who" class="msg">
            <b :class="m.tone">{{ m.who[0] }}</b>
            <span
              ><i>{{ m.who }}</i
              >{{ m.text }}</span
            >
          </p>
          <p class="sys">Макс поставил на паузу</p>
          <div class="compose">Сообщение…</div>
        </div>
      </div>
    </div>

    <div class="toast">
      <span class="toast-icon">❚❚</span>
      Пауза — у всех сразу
    </div>
  </div>
</template>

<style scoped>
.mock {
  position: relative;
  width: 100%;
  max-width: 40rem;
  margin-inline: auto;
}

/* The projector beam falling on the screen. */
.beam {
  position: absolute;
  inset: -18% 0 -10%;
  z-index: -1;
  background:
    radial-gradient(50% 45% at 55% 40%, rgb(255 181 71 / 0.22), transparent 70%),
    radial-gradient(45% 45% at 85% 75%, color-mix(in srgb, var(--color-glow) 30%, transparent), transparent 70%);
  filter: blur(10px);
  pointer-events: none;
}

.window {
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  box-shadow:
    var(--shadow-lg),
    0 0 0 1px rgb(255 255 255 / 0.02) inset;
  overflow: hidden;
}

.chrome {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-3);
  border-bottom: 1px solid var(--color-border);
  background: var(--color-surface-raised);
  font-size: var(--text-xs);
}
.dots {
  display: flex;
  gap: 5px;
}
.dots i {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--color-border-strong);
}
.room-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 700;
  color: var(--color-text);
}
.sync {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 2px var(--space-2);
  border-radius: var(--radius-full);
  background: var(--color-success-soft);
  color: var(--color-success);
  font-weight: 700;
}
.pulse {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
  animation: pulse 1.8s ease-in-out infinite;
}
@keyframes pulse {
  50% {
    opacity: 0.3;
  }
}

.body {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
}

.player {
  position: relative;
  aspect-ratio: 16 / 9;
  display: grid;
  place-items: center;
  background: #050507;
  overflow: hidden;
}
.scene {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(35% 45% at 72% 38%, rgb(255 197 110 / 0.55), transparent 70%),
    radial-gradient(60% 70% at 20% 90%, color-mix(in srgb, var(--color-glow) 35%, transparent), transparent 70%),
    linear-gradient(180deg, transparent 55%, rgb(0 0 0 / 0.7)),
    linear-gradient(160deg, #1b1a24, #07070a);
}
/* A horizon line and hills, to read as "a film frame" rather than an empty gradient. */
.scene::after {
  content: "";
  position: absolute;
  inset: auto 0 0;
  height: 45%;
  background:
    radial-gradient(70% 90% at 25% 100%, #0d0c12 60%, transparent 61%),
    radial-gradient(60% 80% at 80% 100%, #121019 60%, transparent 61%);
}

.who {
  position: absolute;
  top: var(--space-3);
  left: var(--space-3);
  display: flex;
  align-items: center;
}
.who b,
.msg b {
  display: grid;
  place-items: center;
  width: 1.6rem;
  height: 1.6rem;
  flex: none;
  border-radius: 50%;
  font-size: 0.7rem;
  font-weight: 800;
  color: var(--color-accent-contrast);
}
.who b {
  margin-right: -6px;
  border: 2px solid #050507;
}
.who em {
  margin-left: calc(var(--space-2) + 6px);
  font-style: normal;
  font-size: var(--text-xs);
  color: rgb(255 255 255 / 0.8);
}
.a1 {
  background: var(--color-accent);
}
.a2 {
  background: #b9a6ff;
}
.a3 {
  background: #8be0b4;
}

.play {
  position: relative;
  display: grid;
  place-items: center;
  width: 3.4rem;
  height: 3.4rem;
  padding-left: 3px;
  border-radius: 50%;
  background: rgb(255 255 255 / 0.12);
  border: 1px solid rgb(255 255 255 / 0.25);
  backdrop-filter: blur(6px);
  color: #fff;
}

.controls {
  position: absolute;
  inset: auto var(--space-3) var(--space-3);
}
.bar {
  height: 4px;
  border-radius: 2px;
  background: rgb(255 255 255 / 0.2);
}
.bar span {
  position: relative;
  display: block;
  width: 36%;
  height: 100%;
  border-radius: 2px;
  background: var(--color-accent);
}
.bar span::after {
  content: "";
  position: absolute;
  right: -5px;
  top: 50%;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  transform: translateY(-50%);
  background: var(--color-accent);
  box-shadow: 0 0 12px var(--color-accent);
}
.time {
  display: flex;
  justify-content: space-between;
  margin-top: 6px;
  font-size: 0.7rem;
  color: rgb(255 255 255 / 0.7);
}

.chat {
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  gap: var(--space-2);
  padding: var(--space-3);
  border-top: 1px solid var(--color-border);
  font-size: var(--text-xs);
  line-height: 1.4;
}
.msg {
  display: flex;
  gap: var(--space-2);
  align-items: flex-start;
}
.msg span {
  min-width: 0;
  padding: 6px var(--space-2);
  border-radius: var(--radius-sm);
  background: var(--color-surface-raised);
  color: var(--color-text);
}
.msg i {
  display: block;
  font-style: normal;
  font-weight: 700;
  color: var(--color-text-muted);
}
.sys {
  text-align: center;
  color: var(--color-text-faint);
  font-size: 0.7rem;
}
.compose {
  margin-top: var(--space-1);
  padding: 6px var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-full);
  color: var(--color-text-faint);
}
/* On a phone the chat would push the page far down — show only the last line of it. */
.msg:nth-child(-n + 2) {
  display: none;
}

.toast {
  position: absolute;
  /* On a phone there is no free spot over the player; the chat's system line says the same. */
  display: none;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--color-accent-line);
  border-radius: var(--radius-full);
  background: rgb(17 17 22 / 0.9);
  backdrop-filter: blur(8px);
  box-shadow: var(--shadow);
  font-size: var(--text-xs);
  font-weight: 700;
  color: var(--color-text);
  animation: float 5s ease-in-out infinite;
}
.toast-icon {
  color: var(--color-accent);
  font-size: 0.6rem;
  letter-spacing: -1px;
}
@keyframes float {
  50% {
    transform: translateY(-6px);
  }
}

@media (min-width: 34rem) {
  .beam {
    inset-inline: -10%;
  }
  .body {
    grid-template-columns: minmax(0, 1fr) 12.5rem;
  }
  .player {
    aspect-ratio: auto;
    min-height: 15rem;
  }
  .chat {
    border-top: none;
    border-left: 1px solid var(--color-border);
  }
  .msg:nth-child(-n + 2) {
    display: flex;
  }
  .toast {
    display: inline-flex;
    top: 52%;
    left: calc(-1 * var(--space-4));
  }
}

@media (min-width: 64rem) {
  .player {
    min-height: 17rem;
  }
  .toast {
    left: calc(-1 * var(--space-6));
  }
}
</style>
