#!/usr/bin/env bash
# Deploy the home hub's LAN door to the Jetson as the Wendy app `afferent-home-hub-door` (door.py).
# It puts the hub on the Jetson's own Wi-Fi/Ethernet at port 8800 and announces it as _afferent-hub._tcp,
# so a phone on the same network reaches the hub without a Mac. The hub itself (../deploy.sh) is not touched.
#
#   WENDY_DEVICE=<jetson> ./deploy.sh
#
# Settings, all optional, read from the shell and passed to the container through wendy.json:
#   WENDY_DEVICE              device selector                   (default 169.254.246.159:50052, Jetson on USB)
#   AFFERENT_DOOR_UPSTREAM    where the hub is, host:port[,...]  (default auto: 127.0.0.1:18000, then the
#                             hub's role=home-hub advert)
#   AFFERENT_DOOR_INTERFACES  interfaces to announce on, e.g. wlan0 (default: every LAN interface)
#   AFFERENT_DOOR_ADVERTISE   0 = no Bonjour advert, the port only (default 1)
# No token goes into this app: the hub checks it on every request that passes the door.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export AFFERENT_DOOR_UPSTREAM="${AFFERENT_DOOR_UPSTREAM:-}"
export AFFERENT_DOOR_INTERFACES="${AFFERENT_DOOR_INTERFACES:-}"
export AFFERENT_DOOR_ADVERTISE="${AFFERENT_DOOR_ADVERTISE:-}"

DEVICE="${WENDY_DEVICE:-169.254.246.159:50052}"
echo "deploying afferent-home-hub-door to $DEVICE (port 8800, hub ${AFFERENT_DOOR_UPSTREAM:-auto})"
cd "$HERE"
exec wendy run --device "$DEVICE" --detach --yes --restart-unless-stopped
