#!/bin/sh
# Tails cloudflared's logs and prints the assigned Quick Tunnel URL — saves digging through
# `docker compose logs` noise after `bun run prod` / `docker compose up`.
set -eu

COMPOSE_FILES="-f infra/docker-compose.yml -f infra/docker-compose.prod.yml"

echo "Waiting for cloudflared to register a Quick Tunnel URL..."
docker compose $COMPOSE_FILES logs -f cloudflared 2>&1 | grep -m 1 --line-buffered "trycloudflare.com" | grep -oE "https://[a-zA-Z0-9.-]+\.trycloudflare\.com"
