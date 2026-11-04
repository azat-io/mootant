#!/usr/bin/env bash
# Runs the CLI tests (and other environment-sensitive files) under several
# terminal and locale settings, to find tests that depend on the machine.
# Usage: env-matrix.sh <worktree> <out-dir>
set -u
WT=${1:?worktree}; OUT=${2:?out dir}
mkdir -p "$OUT"
cd "$WT" || exit 1
FILES=$(git ls-files 'test/cli/**/*.test.ts' 'test/cli/*.test.ts' | grep -v '^test/cli/index.test.ts$')
FILES="$FILES test/adapters/node-test/score-node-test.test.ts test/core/config/load-typescript-config.test.ts"
run() {
  local label=$1; shift
  local start; start=$(date +%s)
  env -u CI -u NO_COLOR -u FORCE_COLOR "$@" timeout 900 node_modules/.bin/vitest --run --maxWorkers=2 \
    --reporter=json --outputFile.json="$OUT/$label.json" $FILES >"$OUT/$label.log" 2>&1
  local code=$?
  printf '%s\t%s\t%s\t%s\n' "$label" "$code" "$(( $(date +%s) - start ))" "$(cut -d' ' -f1 /proc/loadavg)" | tee -a "$OUT/summary.tsv"
}
run base TERM=xterm-256color
run term-linux TERM=linux
run term-dumb TERM=dumb
run term-unset -u TERM
run ci CI=true TERM=xterm-256color
run force-color FORCE_COLOR=1 TERM=xterm-256color
run no-color NO_COLOR=1 TERM=xterm-256color
run locale-tr LC_ALL=tr_TR.UTF-8 LANG=tr_TR.UTF-8 TERM=xterm-256color
