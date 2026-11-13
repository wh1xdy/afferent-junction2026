#!/usr/bin/env bash
# down.sh — pull results (unless SKIP_PULL=1) then DELETE the instance.
#
# Deleting the instance also deletes its OS volume -- the only copy of
# work_dirs/ lives there, so pull.sh runs first by default.
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

# ------------------------------------------------- 2. confirm
cat >&2 <<EOF
About to DELETE Verda instance '$HOSTNAME' (and its OS volume, including
$REMOTE_ROOT/, the dataset copy and any checkpoints not pulled).
EOF
if [ -z "$YES" ]; then
    printf 'Type the hostname to confirm: ' >&2
    read -r ans
    [ "$ans" = "$HOSTNAME" ] || die "aborted (typed '$ans')."
fi

# --yes skips the CLI's own confirmation; we already asked ours above.
verda vm delete "$HOSTNAME" --yes

log "'$HOSTNAME' deleted. 'verda vm ls' to confirm; billing for the VM stops here."
log "NOTE: the instance's OS volume is destroyed with it -- dataset copy gone."
