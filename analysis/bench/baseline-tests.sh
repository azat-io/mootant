#!/usr/bin/env bash
# Baseline: build + every test:* script of mootant, timed one by one.
# Usage: baseline-tests.sh <worktree> <log-dir>
# Run in a worktree of the commit under study (never in the analysis branch).
set -u
WT=${1:?worktree}
LOG=${2:?log dir}
mkdir -p "$LOG"
cd "$WT" || exit 1
export SKIP_SIMPLE_GIT_HOOKS=1
run() {
  local name=$1; shift
  local start end code
  start=$(date +%s.%N)
  "$@" >"$LOG/$name.log" 2>&1
  code=$?
  end=$(date +%s.%N)
  printf '%s\t%s\t%.1f\n' "$name" "$code" "$(echo "$end - $start" | bc)" | tee -a "$LOG/summary.tsv"
}
: >"$LOG/summary.tsv"
run build pnpm run build
run astro-sync pnpm exec astro sync
for s in astro css format js packages spelling types unit usage; do
  run "test:$s" pnpm run "test:$s"
done
