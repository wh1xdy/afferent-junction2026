#!/usr/bin/env bash
# sync.sh — push the training payload to the instance.
#
# Pushed (rsync over ssh, destination ~/$REMOTE_ROOT/ on the instance):
#   laptop/training/                     -> $REMOTE_ROOT/laptop/training/
#     (minus data/, work_dirs/, cache/, media/weights and verda/config.env)
#   laptop/posture/models/rtmlib/        -> $REMOTE_ROOT/laptop/posture/models/rtmlib/
#     (pretrained ONNX: the `make evaluate` baseline + prelabel models, so
#      the run is offline-friendly)
#   $DATA_DIR                            -> $REMOTE_ROOT/laptop/training/data/
#     (default laptop/training/data; only needed if it lives elsewhere)
#
# How ssh is resolved: `verda ssh` is an interactive wrapper that execs the
# system ssh after resolving the instance IP -- rsync cannot use it as a
# transport (it does not understand `verda ssh host -- rsync --server ...`).
# So we resolve the IP once via `verda vm describe -o json` and run plain
# rsync/ssh as $SSH_USER@<ip>. The private key is the one registered with
# `verda ssh-key` at creation (ssh's default lookup); set SSH_KEY if it is
# non-standard. If resolution fails, export SSH_DEST=user@<ip> directly.
#
# Usage: verda/sync.sh [--dry-run]
# Env: HOSTNAME, SSH_USER, SSH_KEY, SSH_DEST, SSH_OPTS, DATA_DIR, REMOTE_ROOT.
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/_common.sh"

DRY=""
for a in "$@"; do
    case "$a" in
        -n|--dry-run) DRY="--dry-run" ;;
        -h|--help) sed -n '2,22p' "${BASH_SOURCE[0]}"; exit 0 ;;
        *) die "unknown argument: $a" ;;
    esac
done

load_config
check_verda
need rsync

log "checking ssh connectivity (verda ssh $HOSTNAME -- true)"
remote_run true || die "cannot reach '$HOSTNAME' via 'verda ssh'.
  Is the instance running ('verda vm ls')? Did 'up.sh --wait' finish?
  Try: verda ssh $HOSTNAME --user $SSH_USER --key ~/.ssh/<your-key>"

DEST="$(resolve_ssh_dest)"
log "ssh destination: $DEST"
SSH_RSH="ssh $(ssh_opts)"
# verify direct ssh works too (rsync uses it below); if it does not, the user
# almost surely needs SSH_KEY / SSH_OPTS / a different SSH_USER
ssh_direct -o BatchMode=yes "$DEST" true 2>/dev/null || \
    die "direct 'ssh $DEST' failed while 'verda ssh' works.
  Find the key used at creation ('verda ssh-key list') and export e.g.
  SSH_KEY=~/.ssh/id_ed25519  (or SSH_OPTS='-i ... -o ...')."

# Remote layout mirrors the repo: $REMOTE_ROOT/laptop/{training,posture/...}
ssh_direct "$DEST" "mkdir -p \
    '$REMOTE_ROOT/laptop/training' \
    '$REMOTE_ROOT/laptop/posture/models/rtmlib' \
    '$REMOTE_ROOT/laptop/training/data'"

RSYNC=(rsync -az --info=stats1 ${DRY:+$DRY} -e "$SSH_RSH")

# Notes on excludes: data/ is pushed separately below (DATA_DIR); work_dirs/ is
# pulled back by pull.sh, never pushed; verda/config.env stays local.
log "sync laptop/training -> $DEST:$REMOTE_ROOT/laptop/training/"
"${RSYNC[@]}" --delete \
    --exclude '/data/' \
    --exclude '/work_dirs/' \
    --exclude '/cache/' \
    --exclude '/verda/config.env' \
    --exclude '__pycache__/' --exclude '.pytest_cache/' \
    --exclude '*.pth' --exclude '*.onnx' \
    --exclude '*.mp4' --exclude '*.avi' --exclude '*.mov' --exclude '*.mkv' \
    --exclude '*.zip' \
    "$TRAINING_DIR/" "$DEST:$REMOTE_ROOT/laptop/training/"

log "sync laptop/posture/models/rtmlib -> $DEST:$REMOTE_ROOT/laptop/posture/models/rtmlib/"
"${RSYNC[@]}" \
    "$LAPTOP_DIR/posture/models/rtmlib/" \
    "$DEST:$REMOTE_ROOT/laptop/posture/models/rtmlib/"

# Dataset: DATA_DIR is pushed to the remote data/ dir expected by the config
# (AFFERENT_DATA_ROOT=/workspace/training/data inside the container).
DATA_SRC="$(cd "$DATA_DIR" 2>/dev/null && pwd)" || DATA_SRC=""
DATA_DFT="$(cd "$TRAINING_DIR/data" 2>/dev/null && pwd)" || DATA_DFT=""
if [ -n "$DATA_SRC" ] && [ "$DATA_SRC" != "$DATA_DFT" ]; then
    log "sync DATA_DIR=$DATA_SRC -> $DEST:$REMOTE_ROOT/laptop/training/data/"
    "${RSYNC[@]}" "$DATA_SRC/" "$DEST:$REMOTE_ROOT/laptop/training/data/"
elif [ -n "$DATA_DFT" ]; then
    log "sync default dataset $DATA_DFT -> remote data/"
    "${RSYNC[@]}" "$DATA_DFT/" "$DEST:$REMOTE_ROOT/laptop/training/data/"
else
    log "warning: dataset dir '$DATA_DIR' not found locally -- skipping."
    log "         (expected: data/frames/<session>/*.jpg + data/annotations/*.json;"
    log "          run 'make extract split' first, or set DATA_DIR)"
fi

log "done. Next: verda/train.sh"
