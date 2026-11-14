#!/usr/bin/env bash
# train.sh — build the image and run the make targets on the instance.
# Adapted from posture-analysis/training/verda/train.sh.
#
#   verda/train.sh             # docker build + `make dataset train`
#
# Env: VM_HOSTNAME, MAKE_TARGETS ("dataset train" default; add eval once
#        predictions exist), BASE_MODEL, EXTRA (extra args appended to make).
# Prereq: up.sh + sync.sh have run.
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/_common.sh"

load_config
check_verda

remote_run true || die "cannot reach '$VM_HOSTNAME' -- run up.sh first (verda vm ls)."

REMOTE_SCRIPT="$REMOTE_ROOT/Transcription_analyzer/training/verda/remote_train.sh"
remote_run test -f "$REMOTE_SCRIPT" || \
    die "$REMOTE_SCRIPT missing on the instance -- run sync.sh first."

log "launching on $VM_HOSTNAME: make $MAKE_TARGETS (BASE_MODEL=$BASE_MODEL)"
{
    printf 'export REMOTE_ROOT=%q IMAGE=%q BASE_MODEL=%q EXTRA=%q MAKE_TARGETS=%q\n' \
        "$REMOTE_ROOT" "$IMAGE" "$BASE_MODEL" "${EXTRA:-}" "$MAKE_TARGETS"
    printf 'exec bash %q\n' "$REMOTE_SCRIPT"
} | remote_run bash -s

log "done. Fetch artifacts with verda/pull.sh, then shut down with verda/down.sh."
