#!/usr/bin/env bash
# sync.sh — push the training payload to the instance.
# Adapted from posture-analysis/training/verda/sync.sh.
#
# Pushed (rsync over ssh, destination ~/$REMOTE_ROOT/ on the instance):
#   Transcription_analyzer/training/        -> $REMOTE_ROOT/Transcription_analyzer/training/
#     (minus data/, work_dirs/, cache/ and verda/config.env)
#   Transcription_analyzer/analyzer/analyzer/ -> $REMOTE_ROOT/Transcription_analyzer/analyzer/analyzer/
#     (the analyzer package — build_dataset.py imports metrics+prompts from it)
#   $DATA_DIR/                               -> $REMOTE_ROOT/Transcription_analyzer/training/data/
#     (transcript JSONL; default training/data)
#
# Usage: verda/sync.sh [--dry-run]
# Env: VM_HOSTNAME, SSH_USER, SSH_KEY, SSH_DEST, SSH_OPTS, DATA_DIR, REMOTE_ROOT.
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/_common.sh"

DRY=""
for a in "$@"; do
    case "$a" in
        -n|--dry-run) DRY="--dry-run" ;;
        -h|--help) sed -n '2,16p' "${BASH_SOURCE[0]}"; exit 0 ;;
        *) die "unknown argument: $a" ;;
    esac
done

load_config
check_verda

log "checking ssh connectivity (verda ssh $VM_HOSTNAME -- true)"
remote_run true || die "cannot reach '$VM_HOSTNAME' via 'verda ssh'.
  Is the instance running ('verda vm ls')? Did 'up.sh --wait' finish?"

DEST="$(resolve_ssh_dest)"
log "ssh destination: $DEST"
SSH_RSH="ssh $(ssh_opts)"
ssh_direct -o BatchMode=yes "$DEST" true 2>/dev/null || \
    die "direct 'ssh $DEST' failed while 'verda ssh' works.
  Find the key used at creation ('verda ssh-key list') and export e.g.
  SSH_KEY=~/.ssh/id_ed25519  (or SSH_OPTS='-i ... -o ...')."

ssh_direct "$DEST" "mkdir -p \
    '$REMOTE_ROOT/Transcription_analyzer/training/data' \
    '$REMOTE_ROOT/Transcription_analyzer/analyzer/analyzer'"

# push_dir LOCAL_DIR REMOTE_PATH [EXCLUDE ...]
# rsync when available; falls back to tar-over-ssh otherwise (no --delete
# there: stale remote files are only an issue on re-sync, acceptable).
push_dir() {
    local src="$1" dst="$2"; shift 2
    if command -v rsync >/dev/null 2>&1; then
        local args=(); for e in "$@"; do args+=(--exclude "$e"); done
        rsync -az --info=stats1 ${DRY:+$DRY} -e "$SSH_RSH" --delete \
            "${args[@]}" "$src/" "$DEST:$dst"
    else
        [ -n "$DRY" ] && { log "[dry-run] tar push $src -> $dst"; return 0; }
        local args=(); for e in "$@"; do args+=(--exclude="$e"); done
        tar czf - -C "$src" "${args[@]}" . | ssh_direct "$DEST" "tar xzf - -C '$dst'"
    fi
}

log "sync Transcription_analyzer/training -> $DEST:$REMOTE_ROOT/Transcription_analyzer/training/"
push_dir "$TRAINING_DIR" "$REMOTE_ROOT/Transcription_analyzer/training" \
    '/data/' '/work_dirs/' '/cache/' '/verda/config.env' \
    '__pycache__/' '.pytest_cache/' \
    '*.safetensors' '*.gguf' '*.bin' '*.zip'

log "sync analyzer package -> $DEST:$REMOTE_ROOT/Transcription_analyzer/analyzer/analyzer/"
push_dir "$APP_DIR/analyzer/analyzer" \
    "$REMOTE_ROOT/Transcription_analyzer/analyzer/analyzer" \
    '__pycache__/' '.pytest_cache/'

DATA_SRC="$(cd "$DATA_DIR" 2>/dev/null && pwd)" || DATA_SRC=""
DATA_DFT="$(cd "$TRAINING_DIR/data" 2>/dev/null && pwd)" || DATA_DFT=""
if [ -n "$DATA_SRC" ] && [ "$DATA_SRC" != "$DATA_DFT" ]; then
    log "sync DATA_DIR=$DATA_SRC -> $DEST:$REMOTE_ROOT/Transcription_analyzer/training/data/"
    push_dir "$DATA_SRC" "$REMOTE_ROOT/Transcription_analyzer/training/data"
elif [ -n "$DATA_DFT" ]; then
    log "sync default dataset $DATA_DFT -> remote data/"
    push_dir "$DATA_DFT" "$REMOTE_ROOT/Transcription_analyzer/training/data"
else
    log "warning: dataset dir '$DATA_DIR' not found locally -- skipping."
    log "         (expected: data/transcripts/*.jsonl from the simulator;"
    log "          set TRANSCRIPTS/DATA_DIR if it lives elsewhere)"
fi

log "done. Next: verda/train.sh"
