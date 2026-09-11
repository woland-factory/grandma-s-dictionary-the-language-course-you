#!/usr/bin/env bash
set -euo pipefail
# Builds the staging image, brings the stack up, checks /healthz and that real
# content is served, then tears the stack down. Run in the foreground.
cd "$(dirname "$0")/.."

COMPOSE="docker-compose.staging.yml"
PROJECT="grandmas-dictionary-smoke-$$"

# factory-staging-net is external in the staging compose. Create a throwaway
# one for the smoke run if it is missing.
NET_CREATED=0
if ! docker network inspect factory-staging-net >/dev/null 2>&1; then
  docker network create factory-staging-net >/dev/null
  NET_CREATED=1
fi

cleanup() {
  docker compose -p "$PROJECT" -f "$COMPOSE" down -v >/dev/null 2>&1 || true
  if [ "$NET_CREATED" = "1" ]; then
    docker network rm factory-staging-net >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

docker compose -p "$PROJECT" -f "$COMPOSE" up -d --build

CID="$(docker compose -p "$PROJECT" -f "$COMPOSE" ps -q web)"

echo "Waiting for /healthz..."
ok=0
for _ in $(seq 1 30); do
  if docker exec "$CID" wget -qO- http://127.0.0.1/healthz >/dev/null 2>&1; then
    ok=1
    break
  fi
  sleep 2
done
if [ "$ok" != "1" ]; then
  echo "healthz did not come up"
  docker compose -p "$PROJECT" -f "$COMPOSE" logs web || true
  exit 1
fi
echo "healthz OK"

# Confirm the app shell (real content) is served, not a blank page.
if docker exec "$CID" wget -qO- http://127.0.0.1/ | grep -qi "Grandma's Dictionary"; then
  echo "index served real content OK"
else
  echo "index did not contain expected content"
  exit 1
fi

# Confirm config.js was generated from env (SEED_DEMO is set in the compose).
if docker exec "$CID" wget -qO- http://127.0.0.1/config.js | grep -q "__APP_CONFIG__"; then
  echo "config.js generated OK"
else
  echo "config.js missing"
  exit 1
fi

echo "SMOKE PASSED"
