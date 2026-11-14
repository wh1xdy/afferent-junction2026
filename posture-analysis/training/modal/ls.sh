#!/usr/bin/env bash
# ls.sh — list the Modal volume contents, plus account/app status.
#
# Usage: modal/ls.sh [path]     (default path: /)
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/_common.sh"

load_config
check_modal

run_modal volume ls "$MODAL_VOLUME" "${1:-/}"
