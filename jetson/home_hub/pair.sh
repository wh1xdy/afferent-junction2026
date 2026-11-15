#!/usr/bin/env bash
# Prints the home hub's pairing link. It holds the hub token: open it, do not paste it into a chat,
# an issue or a commit.
#
#   ./pair.sh                   link for a browser on this Mac, through `wendy net forward 18000:18000 --device ...`
#   ./pair.sh 172.20.10.2       hub address for the phone app (Settings > Home hub) through a relay on that
#                               address, port 8000 (see the home hub section of the README)
#   ./pair.sh 10.0.32.31:8800   the same for any address and port, e.g. the Jetson's LAN door (door/)
#   ./pair.sh --jetson          the LAN door on the Jetson's own Wi-Fi or Ethernet address, read with
#                               `wendy device info` from WENDY_DEVICE (docs/home-hub.md, "Phone straight to the Jetson")
#   ./pair.sh --jetson-address  only that address and port, without the token
set -euo pipefail

TOKEN_FILE="${AFFERENT_HUB_TOKEN_FILE:-$HOME/.afferent/home-hub.token}"
DOOR_PORT=8800

if [[ "${1:-}" == "--jetson" || "${1:-}" == "--jetson-address" ]]; then
  DEVICE="${WENDY_DEVICE:-169.254.246.159:50052}"
  IP="$(wendy --json device info --device "$DEVICE" | python3 -c '
import ipaddress, json, sys
info = json.load(sys.stdin)
skip = ("lo", "wendy-", "wlmesh", "wlmp", "docker", "veth", "br-", "l4tbr", "usb")
best = []
for i in info.get("networkInterfaces") or []:
    name = i.get("name") or ""
    if name.startswith(skip):
        continue
    for a in i.get("ipAddresses") or []:
        try:
            ip = ipaddress.ip_address(a)
        except ValueError:
            continue
        if ip.version == 4 and not ip.is_loopback and not ip.is_link_local and ip not in ipaddress.ip_network("10.99.0.0/16"):
            best.append((not i.get("isDefaultRoute"), name, a))
print(sorted(best)[0][2] if best else "")
')"
  if [[ -z "$IP" ]]; then
    echo "the Jetson ($DEVICE) has no Wi-Fi or Ethernet address: join it to the phone's Wi-Fi first (docs/home-hub.md)" >&2
    exit 1
  fi
  if [[ "$1" == "--jetson-address" ]]; then
    echo "$IP:$DOOR_PORT"         # no token: for curl and logs
    exit 0
  fi
  set -- "$IP:$DOOR_PORT"
fi

if [[ ! -s "$TOKEN_FILE" ]]; then
  echo "no hub token in $TOKEN_FILE yet: deploy with ./deploy.sh first" >&2
  exit 1
fi
T="$(tr -d '[:space:]' < "$TOKEN_FILE")"
if [[ $# -eq 0 ]]; then
  echo "browser on this Mac: http://127.0.0.1:18000/k/$T/"
else
  ADDR="$1"
  [[ "$ADDR" == *:* ]] || ADDR="$ADDR:8000"
  echo "phone app, Hub address: $ADDR/k/$T"
  echo "phone browser:          http://$ADDR/k/$T/"
fi
