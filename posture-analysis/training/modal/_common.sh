# shellcheck shell=bash
# _common.sh — shared helpers for the modal/*.sh runner scripts.
# Sourced by the scripts; not meant to be executed directly.
#
# Same pattern as verda/_common.sh: load config.env defaults, then check the
# modal CLI + auth. No VM lifecycle — Modal is serverless: push -> run -> pull.
#
# Required on the laptop: a modal client, either `modal` on PATH or `uv`/`uvx`
# (fallback: uvx --from modal). Auth: `modal token new` once (web OAuth), or
# `modal token set` with a token id/secret, or MODAL_TOKEN_ID/_SECRET env.

# ---------------------------------------------------------------- paths
MODAL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TRAINING_DIR="$(dirname "$MODAL_DIR")"           # posture-analysis/training
LAPTOP_DIR="$(dirname "$TRAINING_DIR")"          # laptop
REPO_ROOT="$(dirname "$LAPTOP_DIR")"             # repo root

# ---------------------------------------------------------------- config
load_config() {
    # shellcheck disable=SC1091
    [ -f "$MODAL_DIR/config.env" ] && . "$MODAL_DIR/config.env"

    MODAL_GPU="${MODAL_GPU:-A10}"               # T4 cheaper, L40S faster
    MODAL_VOLUME="${MODAL_VOLUME:-afferent-train}"
    MODAL_TIMEOUT="${MODAL_TIMEOUT:-86400}"     # remote fn timeout, seconds
    MODAL_PKG="${MODAL_PKG:-modal==1.6.4}"      # for the uvx fallback
    AMP="${AMP:-1}"
    MAKE_TARGETS="${MAKE_TARGETS:-train test}"  # add export evaluate when test.json exists
    DEVICE="${DEVICE:-cpu}"                     # evaluate stays cpu (ORT-cpu in image)
    EXTRA="${EXTRA:-}"
    PULL_DIR="${PULL_DIR:-work_dirs}"           # local dir pull.sh writes to
    export MODAL_GPU MODAL_VOLUME MODAL_TIMEOUT
}

# ---------------------------------------------------------------- checks
need() {
    command -v "$1" >/dev/null 2>&1 && return 0
    echo "error: '$1' not found. ${2:-}" >&2
    exit 127
}

# Resolve the modal CLI: `modal` on PATH wins, else uvx with the pinned package.
modal_bin() {
    if command -v modal >/dev/null 2>&1; then
        MODAL=(modal)
    elif command -v uvx >/dev/null 2>&1; then
        MODAL=(uvx --from "$MODAL_PKG" modal)
    else
        die "no modal client. Install one of:
    uv tool install modal            (or pipx install modal / pip install modal)
  then run 'modal token new' once to authenticate."
    fi
}

check_modal() {
    modal_bin
    # `modal token info` exits non-zero when unauthenticated.
    if ! "${MODAL[@]}" token info >/dev/null 2>&1; then
        die "not authenticated. Run once:
    ${MODAL[*]} token new      (opens a browser; OAuth)
  or paste credentials: ${MODAL[*]} token set
  or export MODAL_TOKEN_ID / MODAL_TOKEN_SECRET."
    fi
}

log() { printf '==> %s\n' "$*" >&2; }
die() { printf 'error: %s\n' "$*" >&2; exit 1; }

# Run a modal command. Usage: run_modal run modal_app.py::push
run_modal() {
    modal_bin
    "${MODAL[@]}" "$@"
}
