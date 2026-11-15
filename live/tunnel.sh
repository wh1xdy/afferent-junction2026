#!/usr/bin/env bash
# Puts Afferent Live on the internet through a Cloudflare quick tunnel (no account) and tells the published page
# where it is, by writing endpoint.json.
#
#   live/tunnel.sh             start live/server.py (unless it already answers on $PORT) and the tunnel, and print
#                              the endpoint.json it would publish. Nothing is pushed.
#   live/tunnel.sh --publish   the same, and push endpoint.json (only that file) to the gh-pages branch, each time the
#                              tunnel (re)starts with a new address.
#
# Only port $PORT (default 8787) is exposed: the server that serves the sanitized snapshot. The hub and the sensor box
# stay on this Mac's forwards. A quick tunnel buffers Server-Sent Events, so endpoint.json says "sse": false and the
# page polls /live.json instead. The Mac must stay awake: this script holds a caffeinate assertion while it runs.
# Stop with Ctrl-C; it stops the tunnel and the server if it started it.
set -euo pipefail

ROOT=$(git -C "$(dirname "$0")" rev-parse --show-toplevel)
PORT="${PORT:-8787}"
CLOUDFLARED="${CLOUDFLARED:-$(command -v cloudflared || echo /opt/homebrew/bin/cloudflared)}"
PUBLISH=0
case "${1:-}" in
  --publish) PUBLISH=1 ;;
  "") ;;
  -h|--help) sed -n '2,15p' "$0"; exit 0 ;;
  *) echo "unknown option: $1" >&2; exit 2 ;;
esac

TMP=$(mktemp -d "${TMPDIR:-/tmp}/afferent-tunnel.XXXXXX")
SERVER="" CF=""
cleanup() {
  [ -n "$CF" ] && kill "$CF" 2>/dev/null || true
  [ -n "$SERVER" ] && kill "$SERVER" 2>/dev/null || true
  rm -rf "$TMP"
}
trap cleanup EXIT
trap 'exit 130' INT TERM

command -v caffeinate >/dev/null 2>&1 && caffeinate -dimsu -w $$ &

up() { curl -fsS -m 2 "http://127.0.0.1:$PORT/health" >/dev/null 2>&1; }
if up; then
  echo "server already answers on port $PORT"
else
  PORT="$PORT" python3 "$ROOT/live/server.py" >"$TMP/server.log" 2>&1 &
  SERVER=$!
  for _ in $(seq 1 50); do up && break; sleep 0.2; done
  up || { echo "live/server.py did not start:"; cat "$TMP/server.log"; exit 1; }
  echo "started live/server.py on port $PORT (log: $TMP/server.log)"
fi

publish_endpoint() {   # publish_endpoint <json>: commit endpoint.json alone to gh-pages and push it
  local remote dir
  remote=$(git -C "$ROOT" remote get-url origin)
  dir="$TMP/site"
  rm -rf "$dir"
  if ! git clone -q --depth 1 --branch gh-pages --single-branch "$remote" "$dir" 2>/dev/null; then
    echo "no gh-pages branch on origin yet: run live/publish.sh --publish first" >&2
    return 1
  fi
  printf '%s\n' "$1" > "$dir/endpoint.json"
  git -C "$dir" add endpoint.json
  git -C "$dir" commit -q -m "live: tunnel address"
  git -C "$dir" push -q origin gh-pages
  echo "published endpoint.json to gh-pages (the site picks it up within a minute or two)"
}

while true; do
  : > "$TMP/cf.log"
  "$CLOUDFLARED" tunnel --no-autoupdate --url "http://127.0.0.1:$PORT" >"$TMP/cf.log" 2>&1 &
  CF=$!
  URL=""
  for _ in $(seq 1 120); do
    URL=$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$TMP/cf.log" | grep -v '^https://api\.' | head -1 || true)
    [ -n "$URL" ] && grep -q 'Registered tunnel connection' "$TMP/cf.log" && break
    kill -0 "$CF" 2>/dev/null || break
    sleep 0.5
  done
  if [ -z "$URL" ]; then
    echo "cloudflared gave no address:"; tail -20 "$TMP/cf.log"
  else
    # a brand-new hostname can take a while in this Mac's resolver (a cached miss), so ask 1.1.1.1 as well
    HOST=${URL#https://} OK=0
    for _ in $(seq 1 30); do
      PIN=()
      IP=$(dig +short @1.1.1.1 "$HOST" 2>/dev/null | grep -E '^[0-9.]+$' | head -1 || true)
      [ -n "$IP" ] && PIN=(--resolve "$HOST:443:$IP")
      if curl -fsS -m 4 ${PIN[@]+"${PIN[@]}"} "$URL/health" >/dev/null 2>&1; then OK=1; break; fi
      sleep 2
    done
    [ "$OK" = 1 ] && echo "tunnel answers: $URL/health" || echo "warning: $URL/health did not answer yet"
    ENDPOINT=$(printf '{"live":"%s","sse":false,"updated_iso":"%s"}' "$URL" "$(date -u +%Y-%m-%dT%H:%M:%SZ)")
    echo "tunnel: $URL"
    if [ "$PUBLISH" = 1 ]; then
      publish_endpoint "$ENDPOINT" || true
    else
      echo "would publish endpoint.json: $ENDPOINT   (run with --publish to push it)"
    fi
  fi
  wait "$CF" || true
  CF=""
  echo "tunnel ended; a new one in 5 s (a new address)"
  sleep 5
done
