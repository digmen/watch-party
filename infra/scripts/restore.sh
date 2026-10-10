#!/usr/bin/env bash
# Восстановление БД Watch Party из R2 на ЛЮБОМ сервере (после переезда или потери хоста).
#
#   ./restore.sh              # берёт самый свежий дамп
#   ./restore.sh db/db-XXXX.sql.gz
#
# Порядок на новом сервере: поднять postgres (docker compose up -d postgres), положить
# /root/.watchparty-backup-r2.env, запустить этот скрипт, затем поднять backend и frontend.
# Скрипт ЗАТИРАЕТ содержимое БД — поэтому просит подтверждения.
set -euo pipefail

ENV_FILE=${ENV_FILE:-/root/.watchparty-backup-r2.env}
PG_CONTAINER=${PG_CONTAINER:-infra-postgres-1}
PG_USER=${PG_USER:-watchparty}
PG_DB=${PG_DB:-watchparty}
# shellcheck disable=SC1090
. "$ENV_FILE"

sigv4() { curl -fsS --aws-sigv4 "aws:amz:auto:s3" --user "$R2_ACCESS_KEY_ID:$R2_SECRET_ACCESS_KEY" "$@"; }
EMPTY=$(printf '' | sha256sum | cut -d' ' -f1)

KEY=${1:-}
if [ -z "$KEY" ]; then
  KEY=$(sigv4 -H "x-amz-content-sha256: $EMPTY" "$R2_ENDPOINT/$R2_BUCKET?list-type=2&prefix=${BACKUP_PREFIX:-db}/" \
    | grep -o '<Key>[^<]*</Key>' | sed 's/<[^>]*>//g' | sort | tail -1)
fi
[ -n "$KEY" ] || { echo "в бакете нет дампов" >&2; exit 1; }

echo "Восстанавливаю из $KEY в $PG_CONTAINER/$PG_DB — текущие данные будут ПЕРЕЗАПИСАНЫ."
read -r -p "Продолжить? (yes) " ok
[ "$ok" = "yes" ] || exit 1

TMP=$(mktemp)
trap 'rm -f "$TMP"' EXIT
sigv4 -H "x-amz-content-sha256: $EMPTY" -o "$TMP" "$R2_ENDPOINT/$R2_BUCKET/$KEY"
gzip -t "$TMP"

docker exec "$PG_CONTAINER" psql -U "$PG_USER" -d postgres -c "DROP DATABASE IF EXISTS \"$PG_DB\" WITH (FORCE)" -c "CREATE DATABASE \"$PG_DB\" OWNER \"$PG_USER\""
gunzip -c "$TMP" | docker exec -i "$PG_CONTAINER" psql -U "$PG_USER" -d "$PG_DB" -v ON_ERROR_STOP=1 -q
echo "Готово: $KEY"
