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
    <template v-if="isPrivacy">
      <h1>Политика конфиденциальности</h1>
      <p class="upd">Обновлено 10 октября 2026</p>

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
      <h1>Условия использования</h1>
      <p class="upd">Обновлено 10 октября 2026</p>

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
  </main>
</template>

<style scoped>
.legal {
  max-width: 42rem;
  margin: 0 auto;
  padding: var(--space-8) var(--space-4) var(--space-10);
}
h1 {
  font-size: var(--text-2xl);
}
.upd {
  color: var(--color-text-faint);
  font-size: var(--text-sm);
  margin-bottom: var(--space-6);
}
h2 {
  font-size: var(--text-lg);
  margin: var(--space-6) 0 var(--space-2);
}
p,
li {
  color: var(--color-text-muted);
}
ul {
  padding-left: var(--space-5);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
b {
  color: var(--color-text);
}
</style>
