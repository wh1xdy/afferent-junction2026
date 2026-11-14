#!/usr/bin/env bash
# Deploy the home hub (David's hub + the real UNO Q + the data manager) to the Jetson as the Wendy
# app `afferent-home-hub`.
#
#   ./deploy.sh                 stage, build and deploy
#   ./deploy.sh --stage-only    only refresh stage/ (what the Docker build sees)
#
# `wendy run` builds with this directory as the Docker context, and the hub lives outside it
# (hub/, demo/, contracts/, design/). So the files git knows about in those folders are copied to
# stage/ first (git-ignored): no local database, virtualenv or .env can end up in the image.
#
# Settings, all optional, read from the shell and passed to the container through wendy.json:
#   WENDY_DEVICE                 device selector               (default 169.254.246.159:50052, Jetson on USB)
#   AFFERENT_BEDSIDE_PATIENT     id of the real patient        (default anna, what the phone app sends)
#   AFFERENT_HOME_PATIENT_NAME   display name of that patient  (default: the id, capitalised)
#   AFFERENT_HOME_TMS_END        last treatment day YYYY-MM-DD (default: the day of the first start)
#   AFFERENT_HOME_DEMO_ROSTER    0 = no simulated demo roster  (default 1)
#   AFFERENT_DATA_MANAGER_URL    auto = found over mDNS on the mesh (default); or a fixed http://host:port; off
#   AFFERENT_DATA_MANAGER_TOKEN  bearer token; default: read from ~/.afferent/data-manager.token
#   AFFERENT_TZ                  time zone of the home         (default Europe/Helsinki)
# The token is never written to a file here and never printed.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
STAGE="$HERE/stage"

rm -rf "$STAGE"
mkdir -p "$STAGE"
(cd "$ROOT" && git ls-files -z --cached --others --exclude-standard -- \
    hub/requirements.txt hub/afferent_hub demo contracts design ':(exclude)demo/tests' \
  | tar --null -T - -cf - | tar -xf - -C "$STAGE")
echo "staged $(find "$STAGE" -type f | wc -l | tr -d ' ') files, $(du -sh "$STAGE" | cut -f1) in $STAGE"
if [[ "${1:-}" == "--stage-only" ]]; then exit 0; fi

export AFFERENT_BEDSIDE_PATIENT="${AFFERENT_BEDSIDE_PATIENT:-anna}"
export AFFERENT_HOME_PATIENT_NAME="${AFFERENT_HOME_PATIENT_NAME:-}"
export AFFERENT_HOME_TMS_END="${AFFERENT_HOME_TMS_END:-}"
export AFFERENT_HOME_DEMO_ROSTER="${AFFERENT_HOME_DEMO_ROSTER:-1}"
export AFFERENT_DATA_MANAGER_URL="${AFFERENT_DATA_MANAGER_URL:-auto}"
export AFFERENT_TZ="${AFFERENT_TZ:-Europe/Helsinki}"

TOKEN_FILE="${AFFERENT_DATA_MANAGER_TOKEN_FILE:-$HOME/.afferent/data-manager.token}"
if [[ -z "${AFFERENT_DATA_MANAGER_TOKEN:-}" && -r "$TOKEN_FILE" ]]; then
  AFFERENT_DATA_MANAGER_TOKEN="$(tr -d '[:space:]' < "$TOKEN_FILE")"
fi
export AFFERENT_DATA_MANAGER_TOKEN="${AFFERENT_DATA_MANAGER_TOKEN:-}"
if [[ -z "$AFFERENT_DATA_MANAGER_TOKEN" ]]; then
  echo "warning: no data manager token (AFFERENT_DATA_MANAGER_TOKEN or $TOKEN_FILE): /api/sensors/* will answer 502" >&2
fi

DEVICE="${WENDY_DEVICE:-169.254.246.159:50052}"
echo "deploying afferent-home-hub to $DEVICE (patient $AFFERENT_BEDSIDE_PATIENT, data manager $AFFERENT_DATA_MANAGER_URL)"
cd "$HERE"
exec wendy run --device "$DEVICE" --detach --yes --restart-unless-stopped
