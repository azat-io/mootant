#!/usr/bin/env bash
# Exclusive measurement window, run by the coordinator when nothing else runs.
# Steps: quiet unit tests, display-width A/B, bench tiers 1-3, profiles.
# Usage: window.sh [step...]   (default: all steps)
set -u
export PATH=/home/user/tools/bin:$PATH
RESULTS=${BENCH_RESULTS:-/home/user/projects/bench/results}
LOG=$RESULTS/window.log
mkdir -p "$RESULTS"
steps=${*:-"unit dw tiers profiles protos"}
note() { echo "$(date -u +%FT%TZ) $*" | tee -a "$LOG"; }
note "window start; steps: $steps; $(uptime)"
for step in $steps; do
  case $step in
    unit)
      note "step unit: quiet test:unit without NODE_OPTIONS"
      env -u NODE_OPTIONS /home/user/mootant/analysis/bench/unit-repeat.sh /home/user/wt/tests /home/user/scratch/tests quiet-2
      ;;
    dw)
      note "step dw: hyperfine list core text, base vs ascii fast path"
      hyperfine --warmup 1 --runs 5 --export-json "$RESULTS/display-width-ab.json" --export-markdown "$RESULTS/display-width-ab.md" \
        -n base 'cd /home/user/wt/dogfood && TERM=xterm-256color node bin/mootant.js list core > /dev/null' \
        -n ascii-fast-path 'cd /home/user/wt/perf-dw && TERM=xterm-256color node bin/mootant.js list core > /dev/null' 2>&1 | tee -a "$LOG"
      ;;
    tiers)
      note "step tiers: run.sh --tier 3"
      (cd /home/user/mootant && analysis/bench/run.sh --tier 3) >> "$RESULTS/run.log" 2>&1
      note "tiers done: exit $?"
      ;;
    profiles)
      for p in perfectionist path-to-regexp cheerio fast-json-stringify; do
        note "step profile: $p"
        (cd /home/user/mootant && analysis/bench/profile.sh "$p") >> "$RESULTS/profile.log" 2>&1
      done
      ;;
    protos)
      T=/home/user/mootant/analysis/tools/perf-proto/bench-proto.sh
      for args in "parallel-units path-to-regexp m-cold" "dry-snapshot cheerio m-cold m-warm m-edit" \
                  "parallel-units perfectionist m-cold" "dry-snapshot perfectionist m-cold m-warm m-edit" \
                  "parallel-units fast-json-stringify m-cold" "dry-snapshot fast-json-stringify m-cold m-warm" \
                  "parallel-units cheerio m-cold"; do
        note "step proto: $args"
        (cd /home/user/mootant && $T $args) >> "$RESULTS/protos.log" 2>&1
        note "proto $args done: exit $?"
      done
      ;;
  esac
  note "step $step finished; $(uptime)"
done
note "window end"
