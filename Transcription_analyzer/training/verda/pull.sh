#!/usr/bin/env bash
# pull.sh — fetch training artifacts back from the instance.
#
#   $REMOTE_ROOT/Transcription_analyzer/training/work_dirs/ -> training/work_dirs/
#     (LoRA adapter, merged model, run_config.json, trainer logs)
#
# Usage: verda/pull.sh [--dry-run]
# Env: VM_HOSTNAME, SSH_USER, SSH_KEY, SSH_DEST, SSH_OPTS, REMOTE_ROOT,
#      PULL_DIRS (space-separated remote dirs under training/, default "work_dirs").
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/_common.sh"

DRY=""
for a in "$@"; do
    case "$a" in
        -n|--dry-run) DRY="--dry-run" ;;
        -h|--help) sed -n '2,12p' "${BASH_SOURCE[0]}"; exit 0 ;;
        *) die "unknown argument: $a" ;;
    esac
done

load_config
check_verda

DEST="$(resolve_ssh_dest)"
log "ssh destination: $DEST"
SSH_RSH="ssh $(ssh_opts)"

for d in ${PULL_DIRS:-work_dirs}; do
    mkdir -p "$TRAINING_DIR/$d"
    log "pull $DEST:$REMOTE_ROOT/Transcription_analyzer/training/$d/ -> $TRAINING_DIR/$d/"
    if command -v rsync >/dev/null 2>&1; then
        rsync -az --info=stats1 ${DRY:+$DRY} -e "$SSH_RSH" \
            "$DEST:$REMOTE_ROOT/Transcription_analyzer/training/$d/" \
            "$TRAINING_DIR/$d/"
    else
        # tar-over-ssh fallback (no rsync in this container)
        [ -n "$DRY" ] && { log "[dry-run] tar pull $d"; continue; }
        ssh_direct "$DEST" \
            "cd '$REMOTE_ROOT/Transcription_analyzer/training/$d' 2>/dev/null && tar czf - ." \
            | tar xzf - -C "$TRAINING_DIR/$d/"
    fi
done

log "done. Next: convert the merged model to GGUF (llama.cpp convert_hf_to_gguf.py"
log "      + llama-quantize --q5_k_m) and copy it to the Jetson /data/models/."
