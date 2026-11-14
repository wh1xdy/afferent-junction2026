#!/usr/bin/env bash
# Deploy the home hub (David's hub + the real UNO Q + the data manager) to the Jetson as the Wendy
# app `afferent-home-hub`.
#
#   ./deploy.sh                 stage, build and deploy
#   ./deploy.sh --stage-only    only refresh stage/ (what the Docker build sees)
#
# `wendy run` builds with this directory as the Docker context, and the hub lives outside it
# (hub/, demo/, contracts/, design/). So the tracked files in those folders are copied to stage/
# first (git-ignored), without test folders. An untracked file there stops the deploy: add it to git
# or remove it, so no local database, virtualenv, .env or stray file can end up in the image.
#
# Settings, all optional, read from the shell and passed to the container through wendy.json:
#   WENDY_DEVICE                 device selector               (default 169.254.246.159:50052, Jetson on USB)
#   AFFERENT_BEDSIDE_PATIENT     id of the real patient        (default anna, what the phone app sends)
#   AFFERENT_HOME_PATIENT_NAME   display name of that patient  (default: the id, capitalised)
#   AFFERENT_HOME_TMS_END        last treatment day YYYY-MM-DD (default: the day of the first start)
#   AFFERENT_HOME_DEMO_ROSTER    0 = no simulated demo roster; also removes one an earlier start seeded (default 1)
#   AFFERENT_DATA_MANAGER_URL    auto = found over mDNS on the mesh (default); or a fixed http://host:port; off
#   AFFERENT_DATA_MANAGER_DEVICE the only device whose data manager advert is used (default: this Jetson); empty = any
#   AFFERENT_DATA_MANAGER_TOKEN  bearer token; default: read from ~/.afferent/data-manager.token
#   AFFERENT_HUB_TOKEN           the hub's own pairing token; default: ~/.afferent/home-hub.token, made on first deploy
#   AFFERENT_HUB_ORIGINS         extra web origins allowed to call the hub, comma separated (the phone app is built in)
#   AFFERENT_HUB_HOSTS           DNS names the hub answers to besides addresses and localhost, comma separated
#   AFFERENT_TZ                  time zone of the home         (default Europe/Helsinki)
# Tokens are never written into the repo and never printed; ./pair.sh prints the pairing link on request.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
STAGE="$HERE/stage"
PATHS=(hub/requirements.txt hub/afferent_hub demo contracts design)
SKIP=(':(exclude)demo/tests' ':(glob,exclude)**/tests/**')

untracked="$(cd "$ROOT" && git ls-files --others --exclude-standard -- "${PATHS[@]}" "${SKIP[@]}")"
if [[ -n "$untracked" ]]; then
  echo "untracked files in the folders that go into the image; add them to git or remove them:" >&2
  echo "$untracked" | sed 's/^/  /' >&2
  exit 1
fi
if ! (cd "$ROOT" && git diff --quiet HEAD -- "${PATHS[@]}"); then
  echo "note: uncommitted changes in ${PATHS[*]} are deployed as they are in the working tree" >&2
fi

rm -rf "$STAGE"
mkdir -p "$STAGE"
(cd "$ROOT" && git ls-files -z --cached -- "${PATHS[@]}" "${SKIP[@]}" \
  | tar --null -T - -cf - | tar -xf - -C "$STAGE")
echo "staged $(find "$STAGE" -type f | wc -l | tr -d ' ') files, $(du -sh "$STAGE" | cut -f1) in $STAGE"
if [[ "${1:-}" == "--stage-only" ]]; then exit 0; fi

export AFFERENT_BEDSIDE_PATIENT="${AFFERENT_BEDSIDE_PATIENT:-anna}"
export AFFERENT_HOME_PATIENT_NAME="${AFFERENT_HOME_PATIENT_NAME:-}"
export AFFERENT_HOME_TMS_END="${AFFERENT_HOME_TMS_END:-}"
export AFFERENT_HOME_DEMO_ROSTER="${AFFERENT_HOME_DEMO_ROSTER:-1}"
export AFFERENT_DATA_MANAGER_URL="${AFFERENT_DATA_MANAGER_URL:-auto}"
export AFFERENT_DATA_MANAGER_DEVICE="${AFFERENT_DATA_MANAGER_DEVICE-device-149628ce-6c13-44b8-9b2a-ec527e20caf7}"
export AFFERENT_HUB_ORIGINS="${AFFERENT_HUB_ORIGINS:-}"
export AFFERENT_HUB_HOSTS="${AFFERENT_HUB_HOSTS:-}"
export AFFERENT_TZ="${AFFERENT_TZ:-Europe/Helsinki}"

TOKEN_FILE="${AFFERENT_DATA_MANAGER_TOKEN_FILE:-$HOME/.afferent/data-manager.token}"
if [[ -z "${AFFERENT_DATA_MANAGER_TOKEN:-}" && -r "$TOKEN_FILE" ]]; then
  AFFERENT_DATA_MANAGER_TOKEN="$(tr -d '[:space:]' < "$TOKEN_FILE")"
fi
export AFFERENT_DATA_MANAGER_TOKEN="${AFFERENT_DATA_MANAGER_TOKEN:-}"
if [[ -z "$AFFERENT_DATA_MANAGER_TOKEN" ]]; then
  echo "warning: no data manager token (AFFERENT_DATA_MANAGER_TOKEN or $TOKEN_FILE): /api/sensors/* will answer 502" >&2
fi

HUB_TOKEN_FILE="${AFFERENT_HUB_TOKEN_FILE:-$HOME/.afferent/home-hub.token}"
if [[ -z "${AFFERENT_HUB_TOKEN:-}" ]]; then
  if [[ ! -s "$HUB_TOKEN_FILE" ]]; then
    (umask 077 && mkdir -p "$(dirname "$HUB_TOKEN_FILE")" && openssl rand -hex 24 > "$HUB_TOKEN_FILE")
    echo "made a new hub pairing token in $HUB_TOKEN_FILE (mode 600)"
  fi
  AFFERENT_HUB_TOKEN="$(tr -d '[:space:]' < "$HUB_TOKEN_FILE")"
fi
export AFFERENT_HUB_TOKEN

DEVICE="${WENDY_DEVICE:-169.254.246.159:50052}"
echo "deploying afferent-home-hub to $DEVICE (patient $AFFERENT_BEDSIDE_PATIENT, data manager $AFFERENT_DATA_MANAGER_URL" \
     "${AFFERENT_DATA_MANAGER_DEVICE:+on $AFFERENT_DATA_MANAGER_DEVICE}); pairing link: $HERE/pair.sh"
cd "$HERE"
exec wendy run --device "$DEVICE" --detach --yes --restart-unless-stopped
