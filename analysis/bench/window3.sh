#!/usr/bin/env bash
# Third part of the exclusive window: bench tiers 1-3, prototypes in "on" mode
# compared with the tier points, then CPU profiles of two projects.
set -u
export PATH=/home/user/tools/bin:$PATH
RESULTS=${BENCH_RESULTS:-/home/user/projects/bench/results}
LOG=$RESULTS/window.log
note() { echo "$(date -u +%FT%TZ) $*" | tee -a "$LOG"; }
cd /home/user/mootant || exit 1
note "window3 start; $(uptime)"
note "step tiers: run.sh --tier 3"
bash analysis/bench/run.sh --tier 3 >> "$RESULTS/run.log" 2>&1
note "window3 tiers finished: exit $?; $(uptime)"
T=analysis/tools/perf-proto/bench-proto.sh
for args in "parallel-units perfectionist m-cold" \
            "dry-snapshot perfectionist m-warm m-edit" \
            "dry-snapshot cheerio m-cold m-warm m-edit" \
            "parallel-units fast-json-stringify m-cold" \
            "dry-snapshot fast-json-stringify m-warm" \
            "parallel-units cheerio m-cold"; do
  note "step proto (on): $args"
  BENCH_PROTO_MODES=on bash $T $args >> "$RESULTS/protos.log" 2>&1
  note "window3 proto $args finished: exit $?"
done
for p in perfectionist path-to-regexp; do
  note "step profile: $p"
  bash analysis/bench/profile.sh "$p" >> "$RESULTS/profile.log" 2>&1
  note "window3 profile $p finished: exit $?"
done
note "window3 end; $(uptime)"
