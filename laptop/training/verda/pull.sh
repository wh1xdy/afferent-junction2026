#!/usr/bin/env bash
# pull.sh — fetch training artifacts back from the instance.
#
#   $REMOTE_ROOT/laptop/training/work_dirs/  ->  laptop/training/work_dirs/
#     (checkpoints best_*.pth, exported ONNX + .json, eval reports, logs)
#
# Usage: verda/pull.sh [--dry-run]
# Env: HOSTNAME, SSH_USER, SSH_KEY, SSH_DEST, SSH_OPTS, REMOTE_ROOT,
#      PULL_DIRS (space-separated remote dirs under laptop/training,
#                 default "work_dirs").
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/_common.sh"

DRY=""
for a in "$@"; do
    case "$a" in
        -n|--dry-run) DRY="--dry-run" ;;
        -h|--help) sed -n '2,14p' "${BASH_SOURCE[0]}"; exit 0 ;;
        *) die "unknown argument: $a" ;;
    esac
done

load_config
check_verda
need rsync

DEST="$(resolve_ssh_dest)"
log "ssh destination: $DEST"
SSH_RSH="ssh $(ssh_opts)"

# Trailing slash on the remote dir = merge its *contents* into the local dir.
for d in ${PULL_DIRS:-work_dirs}; do
    mkdir -p "$TRAINING_DIR/$d"
    log "pull $DEST:$REMOTE_ROOT/laptop/training/$d/ -> $TRAINING_DIR/$d/"
    rsync -az --info=stats1 ${DRY:+$DRY} -e "$SSH_RSH" \
        "$DEST:$REMOTE_ROOT/laptop/training/$d/" \
        "$TRAINING_DIR/$d/"
done

log "done. Checkpoints: $TRAINING_DIR/work_dirs/ (run 'make evaluate install-model' locally if needed)"
