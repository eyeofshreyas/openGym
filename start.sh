#!/usr/bin/env bash
# Run openGym for development: the API, the exercise media, and Vite, together.
#
# `docker compose up` is the way to RUN openGym (see README) — it builds the frontend and
# serves everything from one origin. This is for working on it: Vite with hot reload in
# front of the real API, which otherwise takes two terminals and three things to remember.
#
# Ctrl-C stops all of it.
set -euo pipefail
cd "$(dirname "$0")"

# Sourced FIRST, because .env is the deployment's and would otherwise overwrite the settings
# below — its WEB_PORT is the nginx one (8080), not Vite's. Everything dev-specific is read
# after this and named so it cannot collide.
if [ -f .env ]; then set -a; . ./.env; set +a; fi

api_port="${DEV_API_PORT:-3000}"
web_port="${DEV_WEB_PORT:-5173}"
media_port="${DEV_MEDIA_PORT:-8888}"

# Passkeys are bound to RP_ID, so the deployment's hostname would refuse to register or sign
# in on localhost. Dev overrides those two — and only those two.
export RP_ID="${DEV_RP_ID:-localhost}"
export ORIGIN="${DEV_ORIGIN:-http://localhost:$web_port}"
export PORT="$api_port"
# The API defaults to /data, which is the path inside its container and unwritable here. A
# separate directory from the deployment's ./data on purpose: if you are also running
# `docker compose up`, both would be writing the same profiles. Point DATA_DIR at ./data when
# you actually want dev to see your real profiles, and stop the container first.
export DATA_DIR="${DATA_DIR:-$PWD/data-dev}"

busy() { (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null && { exec 3<&-; return 0; } || return 1; }
for p in "api_port:$api_port:DEV_API_PORT" "web_port:$web_port:DEV_WEB_PORT" "media_port:$media_port:DEV_MEDIA_PORT"; do
  port="${p#*:}"; var="${port#*:}"; port="${port%%:*}"
  busy "$port" && { echo "port $port is in use — stop what's on it, or set $var to another" >&2; exit 1; }
done

[ -d api/node_modules ] || (echo "installing api deps…" && npm --prefix api install --silent)
[ -d frontend/node_modules ] || (echo "installing frontend deps…" && npm --prefix frontend install --silent)

pids=()
stop() { trap - INT TERM EXIT; kill "${pids[@]}" 2>/dev/null || true; }
trap stop INT TERM EXIT

node api/server.js & pids+=($!)

# vite proxies /img and /gif to MEDIA_TARGET, and nothing serves it outside Docker — without
# this every exercise animation is a broken box. `docker compose up` downloads ./media; if it
# isn't there yet, the app still runs, just without the demos.
if [ -d media ]; then
  python3 -m http.server "$media_port" --directory media --bind 127.0.0.1 >/dev/null 2>&1 & pids+=($!)
else
  echo "note: ./media is empty — run scripts/fetch-media.sh for the exercise images"
fi

# Run vite directly rather than through npm, so the pid above is the server itself and
# Ctrl-C actually stops it instead of orphaning it. --strictPort so the URL printed here
# stays true rather than vite quietly moving to the next free port.
( cd frontend && exec ./node_modules/.bin/vite --port "$web_port" --strictPort ) & pids+=($!)

cat <<BANNER

  openGym — development

  web     http://localhost:$web_port
  api     http://127.0.0.1:$api_port   (passkeys bound to RP_ID=$RP_ID)
  media   127.0.0.1:$media_port
  data    $DATA_DIR

  ctrl-c stops all of them

BANNER

# Any one of them falling over takes the rest with it, rather than leaving a half-running
# stack that looks fine until the first request fails.
wait -n
