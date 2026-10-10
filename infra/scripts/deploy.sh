#!/usr/bin/env bash
# Деплой на хост, где Caddy уже занят другим сервисом на этом же домене (см.
# infra/docker-compose.caddy.yml) — только эта папка и её контейнеры, Caddyfile/Xray
# не трогаем никогда, у соседей на этом сервере свой прод.
set -euo pipefail
cd "$(dirname "$0")/../.."

git fetch origin master
git reset --hard origin/master

# Порты/лимиты этой машины (infra/.env, не в git) — нужны и compose, и проверкам ниже.
if [ -f infra/.env ]; then set -a; . infra/.env; set +a; fi
WP_BACKEND_PORT=${WP_BACKEND_PORT:-3000}
WP_FRONTEND_PORT=${WP_FRONTEND_PORT:-8080}

COMPOSE="docker compose -f infra/docker-compose.yml -f infra/docker-compose.caddy.yml"

$COMPOSE build backend frontend
$COMPOSE up -d postgres redis

# Симлинк под захардкоженный в сборке относительный путь миграций (см. коммит,
# добавивший этот скрипт) — сборка backend ищет ./src/database/migrations от
# WORKDIR=/repo, а реальные файлы лежат в apps/backend/dist/database/migrations.
# Идемпотентно: -f перезаписывает симлинк, если он уже стоит из прошлого деплоя.
$COMPOSE run --rm --no-deps --user root --entrypoint sh backend -c '
  mkdir -p src/database
  ln -sf /repo/apps/backend/dist/database/migrations /repo/src/database/migrations
  chown -R bun:bun /repo/src
  su bun -c "bun apps/backend/dist/database/migrate.js"
'

$COMPOSE up -d backend frontend

# Ждём health вместо фиксированного sleep — и явно проваливаемся, если не поднялось,
# а не оставляем битый деплой молча висеть.
for i in $(seq 1 20); do
  if curl -fs http://127.0.0.1:${WP_BACKEND_PORT}/api/health >/dev/null 2>&1; then
    echo "backend healthy"
    break
  fi
  if [ "$i" -eq 20 ]; then
    echo "backend did not become healthy in time" >&2
    exit 1
  fi
  sleep 3
done

# Тот же паттерн, что и у backend выше — frontend раньше проверялся одной попыткой сразу
# после `up -d`, без ожидания: контейнер помечен Started/Healthy заметно раньше, чем nginx
# внутри реально готов принять соединение, и одиночный curl иногда ловил это окно (реальный
# случай 01.09 — деплой прошёл полностью успешно, все правки на месте, а CI покраснел на
# ровном месте из-за гонки именно тут).
for i in $(seq 1 20); do
  if curl -fs -o /dev/null http://127.0.0.1:${WP_FRONTEND_PORT}/; then
    echo "frontend healthy"
    break
  fi
  if [ "$i" -eq 20 ]; then
    echo "frontend did not become healthy in time" >&2
    exit 1
  fi
  sleep 3
done

echo "deploy ok"
