#!/usr/bin/env bash
# up.sh — create a Verda GPU instance for a training run.
#
#   verda vm create --kind gpu --instance-type 1A100.40S.22V --location FIN-02 \
#       --os 24.04.cuda13.0.docker --os-volume-size 100 \
#       --hostname afferent-train --ssh-key ssh_key_... --wait
#
# The CUDA docker OS image ships docker + the NVIDIA container toolkit; you
# ssh in as root with the injected key. Requires `verda auth login` to have
# been run once (creds in ~/.verda/credentials, never committed).
#
# Env (defaults in _common.sh / config.env):
#   VM_HOSTNAME         instance hostname          [afferent-train]
#   INSTANCE_TYPE    `verda instance-types --gpu` [1A100.40S.22V]
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

# Warn early if a VM with this hostname already exists (create would either
# fail or silently leave you paying for two instances).
if verda vm ls -o json 2>/dev/null | grep -q "\"$VM_HOSTNAME\""; then
    die "an instance named '$VM_HOSTNAME' already exists (see 'verda vm ls').
  Use it, pick another VM_HOSTNAME, or run down.sh first."
fi

# An SSH key must be injected at creation or nobody can ssh in. Explicit
# SSH_KEY_ID wins; otherwise take the first key registered on the account.
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
    --wait                     # block until ssh-ready
)
[ -n "$SPOT" ] && args+=(--is-spot)   # spot: cheaper but can be evicted mid-run
# EXTRA_CREATE_ARGS is a user-provided flag list; word splitting intended
# shellcheck disable=SC2086
log "verda vm create ${args[*]} $EXTRA_CREATE_ARGS"
# shellcheck disable=SC2086
verda vm create "${args[@]}" $EXTRA_CREATE_ARGS

# `verda ssh` execs the system ssh, which prompts for host-key acceptance on
# a fresh IP -- fatal without a TTY (observed: ssh_askpass + exit 255).
# Seed known_hosts now so `verda ssh` and remote_run connect cleanly.
if ip="$(_verda_ip)" && [ -n "$ip" ]; then
    ssh-keyscan -t ed25519,ecdsa,rsa "$ip" >> ~/.ssh/known_hosts 2>/dev/null || \
        log "warning: ssh-keyscan of $ip failed -- first 'verda ssh' may ask for the host key"
fi

cat <<EOF

Instance '$VM_HOSTNAME' is up.

  connect : verda ssh $VM_HOSTNAME --user $SSH_USER   (add --key ~/.ssh/KEY if needed)
  next    : verda/sync.sh   -- push code + models + dataset
            verda/train.sh  -- build image and run 'make ${MAKE_TARGETS}'
            verda/pull.sh   -- fetch work_dirs/ back
            verda/down.sh   -- delete the instance (billing stops)

Reminder: billing is per-started-10-min on PAYG; delete with down.sh when done.
EOF
