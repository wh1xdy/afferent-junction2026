#!/usr/bin/env bash
# up.sh — create a Verda GPU instance for a training run.
#
#   verda vm create --kind gpu --instance-type 1V100.6V --location FIN-01 \
#       --os ubuntu-24.04-cuda-13.0-open-docker --os-volume-size 100 \
#       --hostname afferent-train --wait
#
# The CUDA docker OS image ships docker + the NVIDIA container toolkit and
# its default user is "ubuntu". Requires `verda auth login` to have been run
# once (creds in ~/.verda/credentials, never committed).
#
# Env (defaults in _common.sh / config.env):
#   HOSTNAME         instance hostname          [afferent-train]
#   INSTANCE_TYPE    `verda instance-types --gpu` [1V100.6V]
#   LOCATION         `verda locations`          [FIN-01]
#   OS_IMAGE         `verda images`             [ubuntu-24.04-cuda-13.0-open-docker]
#   OS_VOLUME_SIZE   GB system disk             [100]
#   SPOT=1           request a spot instance (cheaper, evictable; default on-demand)
#   EXTRA_CREATE_ARGS  extra flags appended to `verda vm create`
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/_common.sh"

load_config
check_verda

# Warn early if a VM with this hostname already exists (create would either
# fail or silently leave you paying for two instances).
if verda vm ls -o json 2>/dev/null | grep -q "\"$HOSTNAME\""; then
    die "an instance named '$HOSTNAME' already exists (see 'verda vm ls').
  Use it, pick another HOSTNAME, or run down.sh first."
fi

args=(
    --kind gpu
    --instance-type "$INSTANCE_TYPE"
    --location "$LOCATION"
    --os "$OS_IMAGE"
    --os-volume-size "$OS_VOLUME_SIZE"
    --hostname "$HOSTNAME"
    --wait                     # block until ssh-ready
)
[ -n "$SPOT" ] && args+=(--spot)   # spot: cheaper but can be evicted mid-run
# EXTRA_CREATE_ARGS is a user-provided flag list; word splitting intended
# shellcheck disable=SC2086
log "verda vm create ${args[*]} $EXTRA_CREATE_ARGS"
# shellcheck disable=SC2086
verda vm create "${args[@]}" $EXTRA_CREATE_ARGS

cat <<EOF

Instance '$HOSTNAME' is up.

  connect : verda ssh $HOSTNAME          (user: $SSH_USER, add --key ~/.ssh/KEY if needed)
  next    : verda/sync.sh   -- push code + models + dataset
            verda/train.sh  -- build image and run 'make ${MAKE_TARGETS}'
            verda/pull.sh   -- fetch work_dirs/ back
            verda/down.sh   -- delete the instance (billing stops)

Reminder: billing is per-started-10-min on PAYG; delete with down.sh when done.
EOF
