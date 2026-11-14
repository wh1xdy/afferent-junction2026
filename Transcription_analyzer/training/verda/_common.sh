# shellcheck shell=bash
# _common.sh — shared helpers for the verda/*.sh runner scripts.
# Adapted from posture-analysis/training/verda (branch poc/laptop-markers).
# Sourced by the scripts; not meant to be executed directly.
#
# Required tools on the laptop: verda CLI (authenticated), rsync, ssh.
# Optional: python3 (only for parsing `verda vm describe -o json`).

# ---------------------------------------------------------------- paths
VERDA_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TRAINING_DIR="$(dirname "$VERDA_DIR")"           # Transcription_analyzer/training
APP_DIR="$(dirname "$TRAINING_DIR")"             # Transcription_analyzer
REPO_ROOT="$(dirname "$APP_DIR")"                # repo root

# ---------------------------------------------------------------- config
load_config() {
    # shellcheck disable=SC1091
    [ -f "$VERDA_DIR/config.env" ] && . "$VERDA_DIR/config.env"

    # --- instance ---
    # Defaults verified against the live catalog (Nov 2026): the only
    # reasonably-priced GPU in stock was 1A100.40S.22V @ FIN-02. Stock moves:
    # check `verda availability --type $INSTANCE_TYPE` before up.sh.
    # Cheap alternative when back: 1V100.4V (needs the *-v100 OS image;
    # an 8B QLoRA fits 16 GB only with --max-len 2048 + bs 1).
    VM_HOSTNAME="${VM_HOSTNAME:-afferent-ta-train}"
    INSTANCE_TYPE="${INSTANCE_TYPE:-1A6000.10V}"
    LOCATION="${LOCATION:-FIN-02}"
    OS_IMAGE="${OS_IMAGE:-24.04.cuda13.0.docker}"
    OS_VOLUME_SIZE="${OS_VOLUME_SIZE:-100}"
    SPOT="${SPOT:-}"
    EXTRA_CREATE_ARGS="${EXTRA_CREATE_ARGS:-}"

    # --- remote layout ---
    # Mirrors the repo: $REMOTE_ROOT/Transcription_analyzer/{training,analyzer}
    REMOTE_ROOT="${REMOTE_ROOT:-afferent}"
    SSH_USER="${SSH_USER:-root}"
    SSH_KEY="${SSH_KEY:-}"
    SSH_KEY_ID="${SSH_KEY_ID:-}"
    SSH_DEST="${SSH_DEST:-}"
    SSH_OPTS="${SSH_OPTS:-}"

    # --- data ---
    # Transcript JSONL files (output of the simulator). Default:
    # Transcription_analyzer/training/data/transcripts.
    DATA_DIR="${DATA_DIR:-$TRAINING_DIR/data}"
    TRANSCRIPTS="${TRANSCRIPTS:-$DATA_DIR/transcripts}"

    # --- run knobs (train.sh / remote_train.sh) ---
    MAKE_TARGETS="${MAKE_TARGETS:-dataset train}"
    IMAGE="${IMAGE:-afferent-ta-train:cu128}"
    BASE_MODEL="${BASE_MODEL:-Qwen/Qwen3-8B}"
    EXTRA="${EXTRA:-}"                        # appended to make targets
}

# ---------------------------------------------------------------- checks
need() {
    command -v "$1" >/dev/null 2>&1 && return 0
    echo "error: '$1' not found. ${2:-}" >&2
    exit 127
}

check_verda() {
    need verda "install: https://github.com/verda-cloud/verda-cli"
    if ! verda vm ls >/dev/null 2>&1; then
        echo "error: 'verda vm ls' failed -- run 'verda auth login' first." >&2
        echo "       ('verda doctor' checks credentials + API reachability.)" >&2
        exit 1
    fi
}

log() { printf '==> %s\n' "$*" >&2; }
die() { printf 'error: %s\n' "$*" >&2; exit 1; }

# ---------------------------------------------------------------- ssh/remote
remote_run() {
    local pre=(--user "$SSH_USER")
    [ -n "$SSH_KEY" ] && pre+=(--key "$SSH_KEY")
    # verda forwards args after `--` to the ssh command line, so our
    # ssh_opts (host-key handling) and the remote command both go there.
    # shellcheck disable=SC2046
    verda ssh "$VM_HOSTNAME" "${pre[@]}" -- $(ssh_opts) "$@"
}

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

_verda_ip() {
    need python3 "needed to parse 'verda vm describe -o json' (or set SSH_DEST)"
    local id out ip
    id="$(resolve_instance_id 2>/dev/null || true)"
    for cmd in "${id:+describe $id}" "ls"; do
        [ -n "$cmd" ] || continue
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

ssh_opts() {
    local opts=(-o StrictHostKeyChecking=accept-new)
    # ~/.ssh can be a read-only mount (devcontainer): keep host keys in a
    # writable file so accept-new actually works instead of failing.
    if ! { [ -w "$HOME/.ssh/known_hosts" ] || [ -w "$HOME/.ssh" ]; }; then
        opts+=(-o "UserKnownHostsFile=/tmp/verda_known_hosts")
    fi
    [ -n "$SSH_KEY" ] && opts+=(-i "$SSH_KEY")
    # shellcheck disable=SC2086
    printf '%s' "${opts[*]}${SSH_OPTS:+ }$SSH_OPTS"
}

ssh_direct() {
    # shellcheck disable=SC2046
    ssh $(ssh_opts) "$@"
}
