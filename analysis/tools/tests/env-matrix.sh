#!/usr/bin/env bash
# Runs the CLI tests (and other environment-sensitive files) under several
# terminal and locale settings, to find tests that depend on the machine.
# Usage: env-matrix.sh <worktree> <out-dir> [label...]
set -u
WT=${1:?worktree}; OUT=${2:?out dir}; shift 2
mkdir -p "$OUT"
cd "$WT" || exit 1
FILES=$(git ls-files 'test/cli/**/*.test.ts' 'test/cli/*.test.ts' | grep -v '^test/cli/index.test.ts$')
FILES="$FILES test/adapters/node-test/score-node-test.test.ts test/adapters/node-test/start-node-test-session.test.ts test/core/config/load-typescript-config.test.ts"
run() {
  local label=$1; shift
  local start; start=$(date +%s)
  env -u CI -u NO_COLOR -u FORCE_COLOR -u NODE_OPTIONS "$@" timeout 900 node_modules/.bin/vitest --run --maxWorkers=2 \
    --testTimeout=30000 --reporter=json --outputFile.json="$OUT/$label.json" $FILES >"$OUT/$label.log" 2>&1
  local code=$?
  printf '%s\t%s\t%s\t%s\n' "$label" "$code" "$(( $(date +%s) - start ))" "$(cut -d' ' -f1 /proc/loadavg)" | tee -a "$OUT/summary.tsv"
}
labels=("$@")
if [ ${#labels[@]} -eq 0 ]; then
  labels=(base term-linux term-dumb term-unset ci force-color no-color locale-tr)
fi
for label in "${labels[@]}"; do
  case $label in
    base) run base TERM=xterm-256color ;;
    term-linux) run term-linux TERM=linux ;;
    term-dumb) run term-dumb TERM=dumb ;;
    term-unset) run term-unset -u TERM ;;
    ci) run ci CI=true TERM=xterm-256color ;;
    force-color) run force-color FORCE_COLOR=1 TERM=xterm-256color ;;
    no-color) run no-color NO_COLOR=1 TERM=xterm-256color ;;
    locale-tr) run locale-tr LC_ALL=tr_TR.UTF-8 LANG=tr_TR.UTF-8 TERM=xterm-256color ;;
  esac
done
