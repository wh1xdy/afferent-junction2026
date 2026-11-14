# shellcheck shell=bash
# _common.sh — shared helpers for the verda/*.sh runner scripts.
# Sourced by the scripts; not meant to be executed directly.
#
# Every script in this directory works the same way:
#   1. source this file
#   2. call load_config   -> defaults applied, verda/config.env overrides them
#   3. use remote_run / resolve_ssh_dest / rsync helpers as needed
#
# Required tools on the laptop: verda CLI (authenticated), rsync, ssh.
# Optional: python3 (only for parsing `verda vm describe -o json`).

# ---------------------------------------------------------------- paths
# Absolute paths, resolved from this file's location so the scripts can be
# called from anywhere (Makefile, other dirs, cron...).
VERDA_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TRAINING_DIR="$(dirname "$VERDA_DIR")"           # posture-analysis/training
LAPTOP_DIR="$(dirname "$TRAINING_DIR")"          # laptop
REPO_ROOT="$(dirname "$LAPTOP_DIR")"             # repo root

# ---------------------------------------------------------------- config
# Defaults. Any of these can be overridden by environment, or by
# verda/config.env (gitignored — copy config.env.example).
load_config() {
    # shellcheck disable=SC1091
    [ -f "$VERDA_DIR/config.env" ] && . "$VERDA_DIR/config.env"

    # --- instance ---
    # Defaults verified against the live catalog (Nov 2026): the only
    # reasonably-priced GPU in stock was 1A100.40S.22V @ FIN-02. Stock moves:
    # check `verda availability --type $INSTANCE_TYPE` before up.sh, and
    # `verda instance-types --gpu` for the full catalog. Cheap alternative
    # when back in stock: 1V100.4V (V100 needs the *-v100 OS image variant).
    VM_HOSTNAME="${VM_HOSTNAME:-afferent-train}"
    INSTANCE_TYPE="${INSTANCE_TYPE:-1A100.40S.22V}"
    LOCATION="${LOCATION:-FIN-02}"
    OS_IMAGE="${OS_IMAGE:-24.04.cuda13.0.docker}"
    OS_VOLUME_SIZE="${OS_VOLUME_SIZE:-100}"
    SPOT="${SPOT:-}"                          # 1 -> pass --is-spot to vm create
    EXTRA_CREATE_ARGS="${EXTRA_CREATE_ARGS:-}" # appended verbatim to vm create

    # --- remote layout ---
    # Everything lands under $HOME/$REMOTE_ROOT on the instance, mirroring
    # the repo: $REMOTE_ROOT/posture-analysis/training, $REMOTE_ROOT/posture-analysis/posture/...
    # The same SSH_USER is passed to `verda ssh --user` and used for direct
    # ssh/rsync, so both paths land in the same home directory.
    REMOTE_ROOT="${REMOTE_ROOT:-afferent}"
    SSH_USER="${SSH_USER:-root}"              # `verda ssh` and the cuda-docker images default to root
    SSH_KEY="${SSH_KEY:-}"                    # e.g. ~/.ssh/id_ed25519
    SSH_KEY_ID="${SSH_KEY_ID:-}"              # Verda ssh-key ID injected at vm create (`verda ssh-key list`)
    SSH_DEST="${SSH_DEST:-}"                  # full override user@1.2.3.4
    SSH_OPTS="${SSH_OPTS:-}"                  # extra ssh options for rsync

    # --- data ---
    # Local dataset root: frames/ + annotations/ as produced by make extract/
    # split. Default: posture-analysis/training/data (i.e. "../data" as seen from this
    # directory). Point it elsewhere if the dataset lives outside the repo.
    DATA_DIR="${DATA_DIR:-$TRAINING_DIR/data}"

    # --- run knobs (train.sh / remote_train.sh) ---
    AMP="${AMP:-}"                            # 1 -> make train AMP=1
    MAKE_TARGETS="${MAKE_TARGETS:-train test}"
    IMAGE="${IMAGE:-afferent-train:cu121}"
    TORCH_VARIANT="${TORCH_VARIANT:-cu121}"
}

# ---------------------------------------------------------------- checks
need() {
    # need <cmd> [hint]
    command -v "$1" >/dev/null 2>&1 && return 0
    echo "error: '$1' not found. ${2:-}" >&2
    exit 127
}

check_verda() {
    need verda "install: https://github.com/verda-cloud/verda-cli"
    # `verda auth login` stores creds in ~/.verda/credentials (never commit);
    # VERDA_CLIENT_ID / VERDA_CLIENT_SECRET env vars work too.
    if ! verda vm ls >/dev/null 2>&1; then
        echo "error: 'verda vm ls' failed -- run 'verda auth login' first." >&2
        echo "       ('verda doctor' checks credentials + API reachability.)" >&2
        exit 1
    fi
}

log() { printf '==> %s\n' "$*" >&2; }
die() { printf 'error: %s\n' "$*" >&2; exit 1; }

# ---------------------------------------------------------------- ssh/remote
# Run a command on the instance. Args are passed through `verda ssh --`, which
# appends them verbatim to the ssh argv (ssh re-joins them on the remote
# shell). Keep args simple (no quotes-with-spaces); for anything complex, push
# a script with rsync and call it, or use:  remote_run bash -s < script.sh
# --user/--key must be passed explicitly: `verda ssh` defaults to root, which
# would silently land us in a different home than rsync when SSH_USER differs.
remote_run() {
    local pre=(--user "$SSH_USER")
    [ -n "$SSH_KEY" ] && pre+=(--key "$SSH_KEY")
    verda ssh "$VM_HOSTNAME" "${pre[@]}" -- "$@"
}

# Resolve the Verda instance ID (inst-...) for $VM_HOSTNAME via `vm list -o json`.
# Needed because `vm describe` / `vm delete` take an instance ID, not a
# hostname (only `verda ssh` resolves hostnames itself).
resolve_instance_id() {
    need python3 "needed to parse 'verda vm list -o json'"
    verda vm list -o json 2>/dev/null | HOST="$VM_HOSTNAME" python3 -c '
import json, os, sys

host = os.environ["HOST"]
try:
    data = json.load(sys.stdin)
except Exception:
    sys.exit(1)
items = data if isinstance(data, list) else [data]

def has_host(o):
    if isinstance(o, dict):
        return any(has_host(v) for v in o.values())
    if isinstance(o, list):
        return any(has_host(v) for v in o)
    return o == host

for d in items:
    if not isinstance(d, dict) or not has_host(d):
        continue
    for k in ("id", "instance_id", "instanceId"):
        if isinstance(d.get(k), str):
            print(d[k], end="")
            sys.exit(0)
sys.exit(1)
'
}

# Print the SSH destination (user@ip) used by rsync/ssh/scp.
# Resolution order:
#   1. SSH_DEST env (authoritative override)
#   2. `verda vm describe <instance-id> -o json`, first public IPv4 in the payload
#   3. `verda vm ls -o json` (fallback), same parsing
resolve_ssh_dest() {
    if [ -n "$SSH_DEST" ]; then
        printf '%s' "$SSH_DEST"
        return 0
    fi

    local ip=""
    ip="$(_verda_ip)" || true
    [ -n "$ip" ] || die "could not resolve an IP for '$VM_HOSTNAME'.
  Check 'verda vm ls' that the instance is running, then either:
    - retry (instance may still be booting), or
    - export SSH_DEST=$SSH_USER@<ip> manually (see 'verda vm ls -o json')."
    printf '%s@%s' "$SSH_USER" "$ip"
}

# Extract the first public-looking IPv4 from `verda vm` JSON output.
# Tries `vm describe <instance-id>` first (hostname is resolved to an ID via
# `vm list`), then `vm ls` (each parsed separately).
_verda_ip() {
    need python3 "needed to parse 'verda vm describe -o json' (or set SSH_DEST)"
    local id out ip
    id="$(resolve_instance_id 2>/dev/null || true)"
    for cmd in "${id:+describe $id}" "ls"; do
        [ -n "$cmd" ] || continue
        # word splitting of $cmd is intentional (fixed strings above)
        # shellcheck disable=SC2086
        out="$(verda vm $cmd -o json 2>/dev/null)" || continue
        ip="$(printf '%s' "$out" | HOST="$VM_HOSTNAME" python3 -c '
import ipaddress, json, os, sys

host = os.environ["HOST"]

def walk(o):
    if isinstance(o, dict):
        for v in o.values():
            yield from walk(v)
    elif isinstance(o, list):
        for v in o:
            yield from walk(v)
    elif isinstance(o, str):
        yield o

pub, other = [], []
try:
    data = json.load(sys.stdin)
except Exception:
    data = None

if isinstance(data, list):
    # `vm ls`: several instances may be listed -- keep only the entries
    # that mention our hostname, so we do not grab another instance IP.
    data = [d for d in data if host in json.dumps(d)] or data

for v in walk(data):
    for s in v.split() if " " in v else (v,):
        try:
            ip = ipaddress.ip_address(s)
        except ValueError:
            continue
        if ip.version != 4:
            continue
        (pub if ip.is_global else other).append(s)
print((pub + other)[0] if (pub or other) else "", end="")
')" || continue
        [ -n "$ip" ] && { printf '%s' "$ip"; return 0; }
    done
    return 1
}

# Base ssh command options shared by ssh/rsync. Adds "-i <key>" when SSH_KEY
# is set and always uses batch-friendly host-key behaviour for a fresh,
# ephemeral VM (it gets a new host key on every `up` anyway).
ssh_opts() {
    local opts=(-o StrictHostKeyChecking=accept-new)
    [ -n "$SSH_KEY" ] && opts+=(-i "$SSH_KEY")
    # word splitting is intentional: SSH_OPTS is a user-provided option list
    # shellcheck disable=SC2086
    printf '%s' "${opts[*]}${SSH_OPTS:+ }$SSH_OPTS"
}

# Direct ssh to the instance using the resolved destination + ssh_opts().
ssh_direct() {
    # ssh_opts() is a word list by design
    # shellcheck disable=SC2046
    ssh $(ssh_opts) "$@"
}
