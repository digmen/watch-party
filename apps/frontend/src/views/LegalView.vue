<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";
import { usePageSeo } from "../seo";

// One component for both documents: the two pages share layout and differ only in text, and a
// route-meta switch keeps them from drifting apart in markup.
const route = useRoute();
const isPrivacy = computed(() => route.name === "privacy");

usePageSeo({
  title: isPrivacy.value ? "Политика конфиденциальности — Watch Party" : "Условия использования — Watch Party",
  description: isPrivacy.value
    ? "Какие данные Watch Party хранит о вас и зачем."
    : "Правила пользования сервисом совместного просмотра Watch Party.",
  path: isPrivacy.value ? "/privacy" : "/terms",
});
</script>

<template>
  <main class="legal">
    <div class="container wrap">
      <header class="doc-head">
        <p class="eyebrow">Документы</p>
        <h1>{{ isPrivacy ? "Политика конфиденциальности" : "Условия использования" }}</h1>
        <p class="upd">Обновлено 10 октября 2026</p>
        <nav class="tabs" aria-label="Документы">
          <RouterLink to="/privacy" :class="{ active: isPrivacy }">Конфиденциальность</RouterLink>
          <RouterLink to="/terms" :class="{ active: !isPrivacy }">Условия</RouterLink>
        </nav>
      </header>

      <article class="doc">
    <template v-if="isPrivacy">

      <h2>Что мы храним</h2>
      <ul>
        <li><b>Гость:</b> имя, которое вы ввели, и техническую сессию (cookie). Больше ничего.</li>
        <li><b>Аккаунт:</b> email и пароль (пароль — только в виде необратимого хеша).</li>
        <li><b>Вход через Google:</b> ваш email, имя и идентификатор Google-аккаунта. Доступа к почте, диску и другим данным Google мы не запрашиваем.</li>
        <li><b>Комнаты:</b> название, список участников и сообщения чата — пока комната существует.</li>
      </ul>

      <h2>Что мы не делаем</h2>
      <ul>
        <li>Не продаём и не передаём ваши данные третьим лицам.</li>
        <li>Не храним видео: сервис воспроизводит только ссылку, которую указал пользователь, и временно кэширует её на сервере.</li>
      </ul>

      <h2>Cookie</h2>
      <p>Нужны только для входа и защиты от подделки запросов. Рекламных cookie сейчас нет. Для обезличенной статистики посещаемости используется Cloudflare Web Analytics — он не ставит cookie и не следит за людьми между сайтами; если реклама появится, эта страница будет обновлена.</p>

      <h2>Сколько хранится</h2>
      <p>Гостевые аккаунты, которые неделю не используются, удаляются автоматически. Аккаунт и данные можно удалить по запросу — напишите нам.</p>

      <h2>Связь</h2>
      <p>По любым вопросам о данных: <a href="mailto:digmen68@gmail.com">digmen68@gmail.com</a>.</p>
    </template>

    <template v-else>

      <h2>О сервисе</h2>
      <p>Watch Party синхронизирует просмотр видео между участниками комнаты. Мы не размещаем видео и не отвечаем за содержимое ссылок, которые добавляют пользователи.</p>

      <h2>Что нельзя</h2>
      <ul>
        <li>Добавлять материалы, распространение которых нарушает закон или права третьих лиц.</li>
        <li>Использовать сервис для спама, атак и обхода ограничений.</li>
        <li>Выдавать себя за другого человека.</li>
      </ul>

      <h2>Ответственность</h2>
      <p>Сервис предоставляется «как есть», без гарантий бесперебойной работы. Мы вправе закрыть комнату или аккаунт, нарушающие эти условия.</p>

      <h2>Связь</h2>
      <p><a href="mailto:digmen68@gmail.com">digmen68@gmail.com</a></p>
    </template>
      </article>
    </div>
  </main>
</template>

<style scoped>
.legal {
  padding: var(--space-8) 0 var(--space-12);
}
.wrap {
  max-width: 46rem;
}
.doc-head {
  margin-bottom: var(--space-6);
}
.doc-head .eyebrow {
  margin-bottom: var(--space-3);
}
h1 {
  /* "конфиденциальности" is one long word in a wide display face: let it hyphenate on phones. */
  font-size: clamp(1.6rem, 6.5vw, 2.6rem);
  hyphens: auto;
  overflow-wrap: break-word;
}
.upd {
  margin-top: var(--space-2);
  color: var(--color-text-faint);
  font-size: var(--text-sm);
}
.tabs {
  display: inline-flex;
  flex-wrap: wrap;
  gap: var(--space-1);
  margin-top: var(--space-5);
  padding: var(--space-1);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-full);
  background: var(--color-surface);
}
.tabs a {
  display: inline-flex;
  align-items: center;
  min-height: 2.75rem;
  padding: 0 var(--space-4);
  border-radius: var(--radius-full);
  color: var(--color-text-muted);
  font-size: var(--text-sm);
  font-weight: 700;
  text-decoration: none;
}
.tabs a:hover {
  color: var(--color-text);
}
.tabs a.active {
  background: var(--color-accent);
  color: var(--color-accent-contrast);
}
.doc {
  padding: var(--space-5);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-xl);
  background: var(--color-surface);
}
.doc h2 {
  font-size: var(--text-lg);
  margin: var(--space-6) 0 var(--space-3);
  padding-top: var(--space-5);
  border-top: 1px solid var(--color-border);
}
.doc h2:first-child {
  margin-top: 0;
  padding-top: 0;
  border-top: none;
}
.doc p,
.doc li {
  color: var(--color-text-muted);
}
.doc ul {
  padding-left: var(--space-5);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
.doc li::marker {
  color: var(--color-accent);
}
.doc a {
  overflow-wrap: anywhere;
}
b {
  color: var(--color-text);
}

@media (min-width: 40rem) {
  .doc {
    padding: var(--space-8);
  }
}
</style>
