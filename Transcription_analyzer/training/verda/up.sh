#!/usr/bin/env bash
# up.sh — create a Verda GPU instance for a training run.
# Adapted from posture-analysis/training/verda/up.sh (see docs/verda_training.md).
#
# Env (defaults in _common.sh / config.env):
#   VM_HOSTNAME      instance hostname          [afferent-ta-train]
#   INSTANCE_TYPE    `verda instance-types --gpu` [1A6000.10V]
#   LOCATION         `verda locations`          [FIN-02]
#   OS_IMAGE         `verda images`             [24.04.cuda13.0.docker]
#   OS_VOLUME_SIZE   GB system disk             [100]
#   SSH_KEY_ID       `verda ssh-key list` — injected at creation [first key]
#   SPOT=1           request a spot instance (cheaper, evictable; default on-demand)
#   EXTRA_CREATE_ARGS  extra flags appended to `verda vm create`
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/_common.sh"

load_config
check_verda

if verda vm ls -o json 2>/dev/null | grep -q "\"$VM_HOSTNAME\""; then
    die "an instance named '$VM_HOSTNAME' already exists (see 'verda vm ls').
  Use it, pick another VM_HOSTNAME, or run down.sh first."
fi

if [ -z "$SSH_KEY_ID" ]; then
    SSH_KEY_ID="$(verda ssh-key list -o json 2>/dev/null | python3 -c '
import json, sys
try:
    data = json.load(sys.stdin)
except Exception:
    data = []
items = data if isinstance(data, list) else [data]
for d in items:
    if not isinstance(d, dict):
        continue
    for k in ("id", "key_id", "ssh_key_id"):
        if isinstance(d.get(k), str):
            print(d[k], end="")
            sys.exit(0)
' 2>/dev/null || true)"
fi
[ -n "$SSH_KEY_ID" ] || die "no SSH key registered on your Verda account.
  Register one first:
    verda ssh-key add --name laptop --public-key \"\$(cat ~/.ssh/id_ed25519.pub)\"
  then re-run, or set SSH_KEY_ID=<id> (see 'verda ssh-key list')."

args=(
    --kind gpu
    --instance-type "$INSTANCE_TYPE"
    --location "$LOCATION"
    --os "$OS_IMAGE"
    --os-volume-size "$OS_VOLUME_SIZE"
    --hostname "$VM_HOSTNAME"
    --ssh-key "$SSH_KEY_ID"
    --wait
)
[ -n "$SPOT" ] && args+=(--is-spot)
# shellcheck disable=SC2086
log "verda vm create ${args[*]} $EXTRA_CREATE_ARGS"
# shellcheck disable=SC2086
verda vm create "${args[@]}" $EXTRA_CREATE_ARGS

# `verda ssh` execs the system ssh, which prompts for host-key acceptance on
# a fresh IP -- fatal without a TTY. Seed known_hosts now.
if ip="$(_verda_ip)" && [ -n "$ip" ]; then
    ssh-keyscan -t ed25519,ecdsa,rsa "$ip" >> ~/.ssh/known_hosts 2>/dev/null || \
        log "warning: ssh-keyscan of $ip failed -- first 'verda ssh' may ask for the host key"
fi

cat <<EOF

Instance '$VM_HOSTNAME' is up.

  connect : verda ssh $VM_HOSTNAME --user $SSH_USER   (add --key ~/.ssh/KEY if needed)
  next    : verda/sync.sh   -- push code + dataset
            verda/train.sh  -- build image and run 'make ${MAKE_TARGETS}'
            verda/pull.sh   -- fetch work_dirs/ back
            verda/down.sh   -- delete the instance (billing stops)

Reminder: billing is per-started-10-min on PAYG; delete with down.sh when done.
EOF
