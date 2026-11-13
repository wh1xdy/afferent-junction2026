#!/usr/bin/env bash
# train.sh — build the image and run the make targets on the instance.
#
# Runs verda/remote_train.sh on the instance via `verda ssh`. Environment is
# forwarded with %q quoting (values may contain spaces; args after `--` are
# re-joined by ssh, so naive quoting would be lost).
#
#   verda/train.sh             # docker build + `make train test`
#
# Env: HOSTNAME, MAKE_TARGETS ("train test" or "train,test,export,evaluate";
#        add export/evaluate once a test.json exists), AMP=1, IMAGE,
#        TORCH_VARIANT, DEVICE (evaluate stays cpu: the image ships ORT-cpu),
#        EXTRA (extra args appended to every make target).
# Prereq: up.sh + sync.sh have run.
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/_common.sh"

load_config
check_verda

remote_run true || die "cannot reach '$HOSTNAME' -- run up.sh first (verda vm ls)."

REMOTE_SCRIPT="$REMOTE_ROOT/laptop/training/verda/remote_train.sh"
remote_run test -f "$REMOTE_SCRIPT" || \
    die "$REMOTE_SCRIPT missing on the instance -- run sync.sh first."

log "launching on $HOSTNAME: make $MAKE_TARGETS (AMP=${AMP:-0})"
{
    printf 'export REMOTE_ROOT=%q IMAGE=%q TORCH_VARIANT=%q AMP=%q DEVICE=%q EXTRA=%q MAKE_TARGETS=%q\n' \
        "$REMOTE_ROOT" "$IMAGE" "$TORCH_VARIANT" "$AMP" "${DEVICE:-cpu}" \
        "${EXTRA:-}" "$MAKE_TARGETS"
    printf 'exec bash %q\n' "$REMOTE_SCRIPT"
} | remote_run bash -s

log "done. Fetch artifacts with verda/pull.sh, then shut down with verda/down.sh."
