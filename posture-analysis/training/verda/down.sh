#!/usr/bin/env bash
# down.sh — pull results (unless SKIP_PULL=1) then DELETE the instance
# AND its attached volumes.
#
# `verda vm delete` takes an instance ID (not the hostname). --with-volumes
# asks for attached-storage deletion but does NOT reliably remove the OS
# volume on CLI v1.10.0 -- so we sweep leftover volumes explicitly (billing
# otherwise continues). The only copy of work_dirs/ lives on that volume,
# so pull.sh runs first.
#
# Usage: verda/down.sh [--yes]
# Env: VM_HOSTNAME, SKIP_PULL=1 (skip the work_dirs rsync -- you lose them),
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
    die "no instance found with hostname '$VM_HOSTNAME' ('verda vm ls' to check)."

cat >&2 <<EOF
About to DELETE Verda instance '$VM_HOSTNAME' ($IID) and ALL attached volumes,
including $REMOTE_ROOT/, the dataset copy and any checkpoints not pulled.
EOF
if [ -z "$YES" ]; then
    printf 'Type the hostname to confirm: ' >&2
    read -r ans
    [ "$ans" = "$VM_HOSTNAME" ] || die "aborted (typed '$ans')."
fi

# --with-volumes should delete attached storage, but on CLI v1.10.0 the OS
# volume was observed to survive the delete anyway (still listed, billing).
# --agent: JSON output + no interactive prompts (the storage multi-select
# breaks non-tty runs even with --yes). We therefore clean leftovers up
# explicitly below as well.
verda vm delete "$IID" --with-volumes --yes --agent

# Belt and braces: delete any volume still attached/pointing at the dead
# instance so nothing keeps billing.
leftovers="$(verda volume list -o json 2>/dev/null | IID="$IID" VM_HOSTNAME="$VM_HOSTNAME" python3 -c '
import json, os, sys
try:
    vols = json.load(sys.stdin)
except Exception:
    sys.exit(0)
if isinstance(vols, dict):
    vols = vols.get("volumes") or vols.get("items") or []
iid, host = os.environ["IID"], os.environ["VM_HOSTNAME"]
out = []
for v in vols:
    s = json.dumps(v)
    if iid in s or v.get("name", "").startswith(host + "-") or v.get("name") == host + "-os":
        vid = v.get("id") or v.get("volume_id") or ""
        if vid:
            out.append(vid)
print("\n".join(out), end="")
')" || leftovers=""
if [ -n "$leftovers" ]; then
    log "deleting leftover volume(s) still billing:"
    printf '%s\n' "$leftovers" | while IFS= read -r vid; do
        verda volume delete "$vid" --yes --agent || \
            log "warning: could not delete volume $vid -- check 'verda volume list'"
    done
fi

log "'$VM_HOSTNAME' deleted with its volumes. 'verda vm ls' + 'verda volume list' to confirm;"
log "billing stops here. NOTE: the dataset copy on the instance is gone."
