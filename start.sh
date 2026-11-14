#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HUB="$ROOT/hub"
VENV="$HUB/.venv"

usage() {
  echo "Usage: ./start.sh [--no-sim] [--serial /dev/tty...] [--ws] [--sim-pulse] [--reset] [--port 8000]"
  echo "  --no-sim       no bedside simulator (bedside off)"
  echo "  --serial PORT  real UNO Q over USB serial (115200 baud)"
  echo "  --ws           bedside device connects to /ws/bedside itself"
  echo "  --sim-pulse    the bedside simulator also streams pulse"
  echo "  --reset        drop the database and reseed the demo roster"
}

PORT="${AFFERENT_PORT:-8000}"
RESET=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-sim) export AFFERENT_BEDSIDE=off ;;
    --serial) export AFFERENT_BEDSIDE="serial:$2"; shift ;;
    --ws) export AFFERENT_BEDSIDE=ws ;;
    --sim-pulse) export AFFERENT_SIM_PULSE=1 ;;
    --reset) RESET=1 ;;
    --port) PORT="$2"; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1"; usage; exit 1 ;;
  esac
  shift
done

if [[ ! -x "$VENV/bin/python" ]]; then
  echo "Creating $VENV"
  python3 -m venv "$VENV"
fi
"$VENV/bin/python" -m pip install -q --disable-pip-version-check -r "$HUB/requirements.txt"

DB="${AFFERENT_DB:-$HUB/data/afferent.db}"
if [[ $RESET -eq 1 ]]; then
  rm -f "$DB" "$DB-wal" "$DB-shm"
fi

lan_ips() {
  if command -v ipconfig >/dev/null 2>&1; then
    for i in en0 en1 en2 en3 en4 en5 bridge100; do ipconfig getifaddr "$i" 2>/dev/null || true; done
  fi
  if command -v hostname >/dev/null 2>&1; then
    hostname -I 2>/dev/null | tr ' ' '\n' || true
  fi
}

IPS="$(lan_ips | grep -E '^[0-9]+\.' | grep -v '^127\.' | sort -u || true)"
echo
echo "Afferent hub on port $PORT (bedside: ${AFFERENT_BEDSIDE:-sim})"
echo "  Clinic dashboard  http://localhost:$PORT/clinic/"
echo "  Game              http://localhost:$PORT/app/"
echo "  Patient view      http://localhost:$PORT/app/patient.html"
for ip in $IPS; do
  echo "  On the LAN ($ip):"
  echo "    Dashboard       http://$ip:$PORT/clinic/"
  echo "    Phone (browser) http://$ip:$PORT/app/"
  echo "    Phone (app)     hub base http://$ip:$PORT (?hub= query or localStorage afferent.hub)"
  echo "    Patient view    http://$ip:$PORT/app/patient.html"
done
echo

cd "$HUB"
exec "$VENV/bin/python" -m uvicorn afferent_hub.main:app --host 0.0.0.0 --port "$PORT"
