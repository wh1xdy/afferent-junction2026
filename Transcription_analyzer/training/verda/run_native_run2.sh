#!/usr/bin/env bash
set -Eeuo pipefail

VERDA_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TRAINING_DIR="$(dirname "$VERDA_DIR")"
APP_DIR="$(dirname "$TRAINING_DIR")"
STARTED=0
RUN_DEADLINE=0
HARD_DEADLINE=0
UP_ATTEMPTED=0
PULLED=0

export VM_HOSTNAME=afferent-ta-run2
export MAKE_TARGETS="${MAKE_TARGETS:-dataset train}"
export PREDICTION_JOBS="${PREDICTION_JOBS:-test:adapter test:base val:adapter val:base}"
export BASE_MODEL=Qwen/Qwen3-8B
export EPOCHS=3
export MAX_LEN=4096
export MAX_WINDOW_CHARS=9000
export OUT=work_dirs/run2
export TOKENIZER=../models/qwen3-8b-lora-run1
export DATA_DIR="$APP_DIR/data"
export TRANSCRIPTS="$DATA_DIR/transcripts"

host_state() {
    local listing
    listing="$(verda vm ls -o json 2>&1)" || return 2
    local rc
    if printf '%s' "$listing" | HOST="$VM_HOSTNAME" python3 -c '
import json, os, sys
try:
    data = json.load(sys.stdin)
except Exception:
    sys.exit(2)
items = data if isinstance(data, list) else [data]
host = os.environ["HOST"]
sys.exit(0 if any(host in json.dumps(item) for item in items) else 1)
'; then
        return 1
    else
        rc=$?
    fi
    [ "$rc" -eq 1 ] && return 0
    return 2
}

start_instance() {
    local attempt=0 delay=5 state checks
    while [ "$attempt" -lt 3 ]; do
        if run_before_deadline bash "$VERDA_DIR/up.sh"; then
            return 0
        fi
        checks=0
        while :; do
            state=0
            host_state || state=$?
            [ "$state" -ne 2 ] && break
            checks=$((checks + 1))
            [ "$checks" -lt 6 ] || return 1
            sleep "$delay"
            delay=$((delay < 60 ? delay * 2 : 60))
        done
        [ "$state" -eq 1 ] && return 0
        attempt=$((attempt + 1))
        [ "$attempt" -lt 3 ] || return 1
        sleep "$delay"
        delay=$((delay < 60 ? delay * 2 : 60))
    done
}

run_before_deadline() {
    local remaining
    remaining=$((RUN_DEADLINE - $(date +%s)))
    [ "$remaining" -gt 0 ] || return 124
    timeout --signal=TERM --kill-after=60 "$remaining" "$@"
}

wait_for_ssh() {
    . "$VERDA_DIR/_common.sh"
    load_config
    local deadline
    echo "Verda create --wait returned the instance as running; retrying SSH for up to 10 minutes"
    deadline=$(($(date +%s) + 600))
    while [ "$(date +%s)" -lt "$deadline" ] &&
          [ "$(date +%s)" -lt "$RUN_DEADLINE" ]; do
        if remote_run true >/dev/null 2>&1; then
            echo "SSH ready on $VM_HOSTNAME"
            return 0
        fi
        echo "SSH is not ready on $VM_HOSTNAME; retrying in 12s"
        sleep 12
    done
    echo >&2 "SSH did not become ready within 10 minutes"
    return 1
}

host_is_absent() {
    local listing
    listing="$(verda vm ls -o json 2>&1)" || return 2
    printf '%s' "$listing" | HOST="$VM_HOSTNAME" python3 -c '
import json, os, sys
data = json.load(sys.stdin)
items = data if isinstance(data, list) else [data]
host = os.environ["HOST"]
sys.exit(1 if any(host in json.dumps(item) for item in items) else 0)
'
}

retry_api() {
    local attempt=0 delay=5 output rc
    while :; do
        if output="$("$@" 2>&1)"; then
            printf '%s\n' "$output"
            return 0
        else
            rc=$?
        fi
        echo >&2 "$output"
        if [[ "$output" != *"lookup api.verda.com"* &&
              "$output" != *"i/o timeout"* &&
              "$output" != *"context deadline exceeded"* &&
              "$output" != *"connection refused"* ]]; then
            return "$rc"
        fi
        attempt=$((attempt + 1))
        [ "$attempt" -lt 6 ] || return "$rc"
        sleep "$delay"
        delay=$((delay < 60 ? delay * 2 : 60))
    done
}

try_candidate() {
    local type="$1" location="$2" price available images image mode
    price="$(printf '%s' "$CATALOG" | TYPE="$type" python3 -c '
import json, os, sys
rows = json.load(sys.stdin)
for row in rows:
    if row.get("instance_type") == os.environ["TYPE"]:
        print(row.get("price_per_hour", ""))
        sys.exit(0)
sys.exit(1)
')" || return 1
    if [ "$type" = 1A100.22V ] &&
            ! awk -v p="$price" 'BEGIN { exit !(p <= 2.5) }'; then
        echo "skip $type: on-demand price $price exceeds $2.50/hour" >&2
        return 1
    fi
    if [ "$type" = 1B200.30V ] &&
            ! awk -v p="$price" 'BEGIN { exit !(p <= 4.0) }'; then
        echo "skip $type: on-demand price $price exceeds \$4.00/hour" >&2
        return 1
    fi
    available="$(retry_api verda availability --type "$type" \
        --location "$location" -o json)" || return 2
    printf '%s' "$available" | python3 -c '
import json, sys
data = json.load(sys.stdin)
sys.exit(0 if data.get("available") and not data.get("spot") else 1)
' || return 1
    images="$(retry_api verda images --type "$type" -o json)" || return 2
    image="$(printf '%s' "$images" | python3 -c '
import json, sys
rows = json.load(sys.stdin)
available = {r.get("image_type") for r in rows}
choices = ("24.04.cuda13.0.docker", "24.04.cuda13.2.docker",
           "24.04.cuda13.4.docker", "24.04.cuda12.9.docker")
print(next((item for item in choices if item in available), ""))
')"
    [ -n "$image" ] || {
        echo "skip $type: no compatible Ubuntu CUDA+Docker image" >&2
        return 1
    }
    export INSTANCE_TYPE="$type" LOCATION="$location" OS_IMAGE="$image"
    export REMOTE_MODE=docker SPOT=
    echo "selected $INSTANCE_TYPE at $LOCATION: \$$price/hour, image=$OS_IMAGE, mode=docker"
    return 0
}

select_ordered() {
    local rc type location
    if try_candidate 1A100.22V FIN-02; then return 0; else rc=$?; fi
    [ "$rc" -ne 2 ] || return 2
    for type in 1RTX6000ADA.10V 1A6000.10V; do
        for location in FIN-01 FIN-02 FIN-03; do
            if try_candidate "$type" "$location"; then return 0; else rc=$?; fi
            [ "$rc" -ne 2 ] || return 2
        done
    done
    if try_candidate 1B200.30V FIN-03; then return 0; else rc=$?; fi
    [ "$rc" -ne 2 ] || return 2
    return 1
}

select_capacity() {
    local poll_deadline rc
    CATALOG="$(retry_api verda instance-types --gpu -o json)" || return 1
    if select_ordered; then return 0; else rc=$?; fi
    [ "$rc" -ne 2 ] || return 1
    echo "approved capacity absent; polling on-demand types every 2 minutes for up to 30 minutes"
    poll_deadline=$(($(date +%s) + 30 * 60))
    while [ "$(date +%s)" -lt "$poll_deadline" ]; do
        sleep 120
        CATALOG="$(retry_api verda instance-types --gpu -o json)" || return 1
        if select_ordered; then return 0; else rc=$?; fi
        [ "$rc" -ne 2 ] || return 1
    done
    echo >&2 "no approved on-demand capacity appeared within 30 minutes"
    return 1
}

cleanup() {
    local rc=$? now remaining delay pull_remaining down_timeout
    trap - EXIT INT TERM
    if [ "$UP_ATTEMPTED" -eq 1 ]; then
        now="$(date +%s)"
        remaining=$((HARD_DEADLINE - now))
        if [ "$PULLED" -ne 1 ] && [ "$remaining" -gt 600 ]; then
            pull_remaining=$((remaining - 600))
            [ "$pull_remaining" -gt 900 ] && pull_remaining=900
            timeout --signal=TERM --kill-after=30 "$pull_remaining" \
                bash "$VERDA_DIR/pull.sh" || true
        fi
        delay=5
        while [ "$(date +%s)" -lt "$HARD_DEADLINE" ]; do
            remaining=$((HARD_DEADLINE - $(date +%s)))
            if [ "$remaining" -le 0 ]; then
                break
            fi
            down_timeout=$remaining
            [ "$down_timeout" -gt 180 ] && down_timeout=180
            timeout --signal=TERM --kill-after=30 "$down_timeout" \
                env SKIP_PULL=1 YES=1 bash "$VERDA_DIR/down.sh" --yes || true
            if host_is_absent; then
                now="$(date +%s)"
                echo "verified: $VM_HOSTNAME absent; elapsed from wrapper start: $((now - STARTED))s"
                break
            fi
            sleep "$delay"
            delay=$((delay < 60 ? delay * 2 : 60))
        done
        if ! host_is_absent; then
            echo >&2 "could not confirm deletion before the 2.5-hour hard deadline"
            rc=1
        fi
    fi
    exit "$rc"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

select_capacity
STARTED="$(date +%s)"
RUN_DEADLINE=$((STARTED + 120 * 60))
HARD_DEADLINE=$((STARTED + 150 * 60))
printf 'wrapper start: %s; hard deadline: %s\n' \
    "$(date -u -d "@$STARTED" '+%Y-%m-%dT%H:%M:%SZ')" \
    "$(date -u -d "@$HARD_DEADLINE" '+%Y-%m-%dT%H:%M:%SZ')"
UP_ATTEMPTED=1
start_instance
wait_for_ssh
run_before_deadline bash "$VERDA_DIR/sync.sh"
run_before_deadline bash "$VERDA_DIR/train.sh"
run_before_deadline bash "$VERDA_DIR/pull.sh"
PULLED=1
