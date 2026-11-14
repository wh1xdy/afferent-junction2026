#!/usr/bin/env bash
# down.sh — pull results (unless SKIP_PULL=1) then DELETE the instance
# AND its attached volumes.
#
# `verda vm delete` takes an instance ID (not the hostname) and, without
# --with-volumes, leaves the OS volume detached -- which KEEPS BILLING.
# The only copy of work_dirs/ lives on that volume, so pull.sh runs first.
#
# Usage: verda/down.sh [--yes]
# Env: HOSTNAME, SKIP_PULL=1 (skip the work_dirs rsync -- you lose them),
#      plus the pull.sh env when pulling.
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/_common.sh"

YES="${YES:-}"
for a in "$@"; do
    case "$a" in
        -y|--yes) YES=1 ;;
        -h|--help) sed -n '2,10p' "${BASH_SOURCE[0]}"; exit 0 ;;
        *) die "unknown argument: $a" ;;
    esac
done

load_config
check_verda

# ------------------------------------------------- 1. get artifacts out
if [ "${SKIP_PULL:-0}" != "1" ]; then
    log "pulling work_dirs/ before teardown (SKIP_PULL=1 to skip)"
    "$VERDA_DIR/pull.sh" || die "pull failed -- aborting delete (results are only on the instance).
  Fix the pull or re-run with SKIP_PULL=1 if you really mean it."
else
    log "SKIP_PULL=1: NOT pulling work_dirs -- remote copy will be destroyed."
fi

# ------------------------------------------------- 2. resolve + confirm
# `vm delete` wants the instance ID; the hostname is only a list/display name.
IID="$(resolve_instance_id)" || \
    die "no instance found with hostname '$HOSTNAME' ('verda vm ls' to check)."

cat >&2 <<EOF
About to DELETE Verda instance '$HOSTNAME' ($IID) and ALL attached volumes,
including $REMOTE_ROOT/, the dataset copy and any checkpoints not pulled.
EOF
if [ -z "$YES" ]; then
    printf 'Type the hostname to confirm: ' >&2
    read -r ans
    [ "$ans" = "$HOSTNAME" ] || die "aborted (typed '$ans')."
fi

# --with-volumes is required: without it the OS volume survives detached and
# keeps billing. --yes skips the CLI's own confirmation; we already asked ours.
verda vm delete "$IID" --with-volumes --yes

log "'$HOSTNAME' deleted with its volumes. 'verda vm ls' + 'verda volume list' to confirm;"
log "billing stops here. NOTE: the dataset copy on the instance is gone."
