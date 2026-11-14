#!/usr/bin/env bash
# Prints the home hub's pairing link. It holds the hub token: open it, do not paste it into a chat,
# an issue or a commit.
#
#   ./pair.sh               link for a browser on this Mac, through `wendy net forward 18000:18000 --device ...`
#   ./pair.sh 172.20.10.2   hub address for the phone app (Settings > Hub address) through a relay on that
#                           address, port 8000 (see the home hub section of the README)
set -euo pipefail

TOKEN_FILE="${AFFERENT_HUB_TOKEN_FILE:-$HOME/.afferent/home-hub.token}"
if [[ ! -s "$TOKEN_FILE" ]]; then
  echo "no hub token in $TOKEN_FILE yet: deploy with ./deploy.sh first" >&2
  exit 1
fi
T="$(tr -d '[:space:]' < "$TOKEN_FILE")"
if [[ $# -eq 0 ]]; then
  echo "browser on this Mac: http://127.0.0.1:18000/k/$T/"
else
  echo "phone app, Hub address: $1/k/$T"
  echo "phone browser:          http://$1:8000/k/$T/"
fi
