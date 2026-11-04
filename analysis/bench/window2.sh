#!/usr/bin/env bash
# Second part of the exclusive window (after the exec-bit fix): waits for the
# running prototype measurement, then bench tiers 1-3, prototypes in "on" mode
# compared with the tier points, then CPU profiles.
set -u
export PATH=/home/user/tools/bin:$PATH
RESULTS=${BENCH_RESULTS:-/home/user/projects/bench/results}
LOG=$RESULTS/window.log
note() { echo "$(date -u +%FT%TZ) $*" | tee -a "$LOG"; }
cd /home/user/mootant || exit 1
while pgrep -f "bench-proto.sh parallel-units path-to-regexp" > /dev/null; do sleep 20; done
note "window2 start; $(uptime)"
note "step tiers: run.sh --tier 3"
bash analysis/bench/run.sh --tier 3 >> "$RESULTS/run.log" 2>&1
note "tiers done: exit $?; $(uptime)"
T=analysis/tools/perf-proto/bench-proto.sh
for args in "dry-snapshot cheerio m-cold m-warm m-edit" \
            "parallel-units perfectionist m-cold" \
            "dry-snapshot perfectionist m-warm m-edit" \
            "parallel-units fast-json-stringify m-cold" \
            "dry-snapshot fast-json-stringify m-warm" \
            "parallel-units cheerio m-cold"; do
  note "step proto (on): $args"
  BENCH_PROTO_MODES=on bash $T $args >> "$RESULTS/protos.log" 2>&1
  note "proto $args done: exit $?"
done
for p in perfectionist path-to-regexp cheerio fast-json-stringify; do
  note "step profile: $p"
  bash analysis/bench/profile.sh "$p" >> "$RESULTS/profile.log" 2>&1
  note "profile $p done: exit $?"
done
note "window2 end; $(uptime)"
