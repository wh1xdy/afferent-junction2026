#!/usr/bin/env bash
# Supplemental watchdog: when orchestrate.py's nudge count on a session
# reaches >=3 without effect (claude agents wind down early and ignore
# the short resume note), re-send a strong explicit steer that has
# proven to un-stick them. Deduplicates on (session, nudge_number).
LOG=/tmp/orchestrate.log
declare -A handled
while true; do
    while read -r n sid; do
        [ -z "$n" ] && continue
        if [ "$n" -ge 3 ]; then
            key="${sid}:${n}"
            if [ -z "${handled[$key]:-}" ]; then
                handled[$key]=1
                acctl send "$sid" --steer "[Orchestrator] Your partner just replied and is waiting. The conversation is NOT over — it must continue for many more exchanges (aim ~100 of your lines total). Send your next spoken line NOW via agentcontrol_send_message — re-engage or propose a fresh everyday topic (garden, cooking, telly, dogs). Do NOT say goodbye." >/dev/null 2>&1
                echo "[kicker] strong steer -> $sid (nudge $n)" >> /tmp/kicker.log
            fi
        fi
    done < <(tail -60 "$LOG" | grep -oE 'nudge [0-9]+ to s-[a-f0-9]+' | sed -E 's/nudge ([0-9]+) to (s-[a-f0-9]+)/\1 \2/')
    sleep 90
done
