#!/bin/sh
# Builds Heart Duel: copies game.js into index.html, then compiles the bridge.
set -eu
cd "$(dirname "$0")"
if command -v node >/dev/null 2>&1; then
  node inline.js
else
  echo "node not found: index.html keeps the game.js copy it already has"
fi
swiftc -O bridge.swift -o heart-duel
echo "built ./heart-duel  (start: ./heart-duel   or   ./heart-duel --demo   then open http://localhost:8765)"
