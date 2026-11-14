#!/usr/bin/env bash
# train.sh — run the make targets on the instance.
# Adapted from posture-analysis/training/verda/train.sh.
#
#   verda/train.sh             # remote mode selected by REMOTE_MODE
#
# Env: VM_HOSTNAME, MAKE_TARGETS, PREDICTION_JOBS, BASE_MODEL, EXTRA, EPOCHS, MAX_LEN,
#      MAX_WINDOW_CHARS, OUT, TOKENIZER, REMOTE_MODE.
# Prereq: up.sh + sync.sh have run.
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/_common.sh"

load_config
check_verda

remote_run true || die "cannot reach '$VM_HOSTNAME' -- run up.sh first (verda vm ls)."

REMOTE_SCRIPT="$REMOTE_ROOT/Transcription_analyzer/training/verda/remote_train.sh"
remote_run test -f "$REMOTE_SCRIPT" || \
    die "$REMOTE_SCRIPT missing on the instance -- run sync.sh first."

log "launching on $VM_HOSTNAME: make $MAKE_TARGETS; predictions=$PREDICTION_JOBS (BASE_MODEL=$BASE_MODEL)"
{
    printf 'export REMOTE_ROOT=%q IMAGE=%q BASE_MODEL=%q EXTRA=%q MAKE_TARGETS=%q PREDICTION_JOBS=%q EPOCHS=%q MAX_LEN=%q MAX_WINDOW_CHARS=%q OUT=%q TOKENIZER=%q REMOTE_MODE=%q\n' \
        "$REMOTE_ROOT" "$IMAGE" "$BASE_MODEL" "${EXTRA:-}" "$MAKE_TARGETS" \
        "${PREDICTION_JOBS:-test:adapter test:base val:adapter val:base}" \
        "${EPOCHS:-3}" "${MAX_LEN:-4096}" "${MAX_WINDOW_CHARS:-9000}" \
        "${OUT:-work_dirs/run2}" "${TOKENIZER:-../models/qwen3-8b-lora-run1}" \
        "${REMOTE_MODE:-docker}"
    printf 'exec bash %q\n' "$REMOTE_SCRIPT"
} | remote_run bash -s

log "done. Fetch artifacts with verda/pull.sh, then shut down with verda/down.sh."
