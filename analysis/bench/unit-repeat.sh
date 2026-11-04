#!/usr/bin/env bash
# Repeated `test:unit` runs with per-test JSON for timing and flakiness analysis.
# Usage: unit-repeat.sh <worktree> <out-dir> <run-label>
set -u
WT=${1:?worktree}; OUT=${2:?out dir}; LABEL=${3:?label}
mkdir -p "$OUT"
cd "$WT" || exit 1
export TERM=xterm-256color SKIP_SIMPLE_GIT_HOOKS=1
start=$(date +%s.%N)
pnpm exec vitest --run --coverage --coverage.reportOnFailure \
  --reporter=default --reporter=json --outputFile.json="$OUT/$LABEL.json" \
  >"$OUT/$LABEL.log" 2>&1
code=$?
end=$(date +%s.%N)
printf '%s\t%s\t%.1f\t%s\n' "$LABEL" "$code" "$(echo "$end - $start" | bc)" "$(uptime | sed 's/.*load average: //')" | tee -a "$OUT/summary.tsv"
