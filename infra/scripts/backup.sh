#!/usr/bin/env bash
# Ежедневный бэкап БД Watch Party: pg_dump -> диск (7 дней) и Cloudflare R2, бакет watchparty-backups
# (автоудаление через 30 дней, правило lifecycle на самом бакете).
#
# Зачем R2, а не только диск: проект стоит на чужом сервере и может переехать. Дамп в R2 переживает
# и этот сервер, и смену домена — восстановить можно на любой машине (см. restore.sh).
#
# Ключи читаются из /root/.watchparty-backup-r2.env (R2_ENDPOINT, R2_ACCESS_KEY_ID,
# R2_SECRET_ACCESS_KEY, R2_BUCKET) — вне репозитория, deploy.sh их не трогает.
# Зависит только от docker и curl >= 7.75 (подпись SigV4 встроена в curl).
set -euo pipefail

ENV_FILE=${ENV_FILE:-/root/.watchparty-backup-r2.env}
DIR=${BACKUP_DIR:-/var/backups/watchparty}
PG_CONTAINER=${PG_CONTAINER:-infra-postgres-1}
PG_USER=${PG_USER:-watchparty}
PG_DB=${PG_DB:-watchparty}

# shellcheck disable=SC1090
. "$ENV_FILE"

TS=$(date -u +%Y%m%d-%H%M%S)
FILE="$DIR/db-$TS.sql.gz"
# Одна корзина на несколько серверов: у каждого свой префикс (BACKUP_PREFIX в файле ключей).
KEY="${BACKUP_PREFIX:-db}/db-$TS.sql.gz"
mkdir -p "$DIR"

docker exec "$PG_CONTAINER" pg_dump -U "$PG_USER" -d "$PG_DB" | gzip > "$FILE"
SIZE=$(stat -c%s "$FILE")
# Пустая база даёт ~1.5 КБ схемы; меньше — значит pg_dump упал молча.
[ "$SIZE" -gt 1000 ] || { echo "дамп подозрительно мал: $SIZE байт" >&2; exit 1; }
gzip -t "$FILE"

SHA=$(sha256sum "$FILE" | cut -d' ' -f1)
curl -fsS -o /dev/null --aws-sigv4 "aws:amz:auto:s3" --user "$R2_ACCESS_KEY_ID:$R2_SECRET_ACCESS_KEY" \
  -H "x-amz-content-sha256: $SHA" -T "$FILE" "$R2_ENDPOINT/$R2_BUCKET/$KEY"

# Проверяем, что объект реально лёг и размер совпадает, а не верим коду 200 на слово.
EMPTY=$(printf '' | sha256sum | cut -d' ' -f1)
REMOTE=$(curl -fsSI --aws-sigv4 "aws:amz:auto:s3" --user "$R2_ACCESS_KEY_ID:$R2_SECRET_ACCESS_KEY" \
  -H "x-amz-content-sha256: $EMPTY" "$R2_ENDPOINT/$R2_BUCKET/$KEY" | tr -d '\r' | awk -F': ' 'tolower($1)=="content-length"{print $2}')
[ "$REMOTE" = "$SIZE" ] || { echo "в R2 лежит $REMOTE байт, а дамп $SIZE" >&2; exit 1; }

find "$DIR" -type f -name 'db-*.sql.gz' -mtime +7 -delete
echo "$(date -u +%FT%TZ) ok $KEY $SIZE bytes"
