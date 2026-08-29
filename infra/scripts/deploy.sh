#!/usr/bin/env bash
# Деплой на хост, где Caddy уже занят другим сервисом на этом же домене (см.
# infra/docker-compose.caddy.yml) — только эта папка и её контейнеры, Caddyfile/Xray
# не трогаем никогда, у соседей на этом сервере свой прод.
set -euo pipefail
cd "$(dirname "$0")/../.."

git fetch origin master
git reset --hard origin/master

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
  if curl -fs http://127.0.0.1:3000/api/health >/dev/null 2>&1; then
    echo "backend healthy"
    break
  fi
  if [ "$i" -eq 20 ]; then
    echo "backend did not become healthy in time" >&2
    exit 1
  fi
  sleep 3
done

curl -fs -o /dev/null http://127.0.0.1:8080/
echo "deploy ok"
