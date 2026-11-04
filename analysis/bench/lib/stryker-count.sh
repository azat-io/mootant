#!/usr/bin/env bash
# Number of mutants Stryker makes for the bench files of a project, without
# running tests: starts `stryker run` and stops it at the Instrumenter line.
# Usage: stryker-count.sh <project>
set -uo pipefail
. "$(dirname "$0")/env.sh"
bench_project "${1:?project}"
bash "$BENCH_HOME/prepare/state.sh" "$NAME" clean
cd "$PROJECT_DIR" || exit 1
log=$(mktemp)
node node_modules/@stryker-mutator/core/bin/stryker.js run stryker.bench.json --concurrency 1 >"$log" 2>&1 &
pid=$!
for _ in $(seq 1 600); do
  if grep -q 'Instrumented' "$log" || ! kill -0 "$pid" 2>/dev/null; then break; fi
  sleep 0.2
done
kill "$pid" 2>/dev/null
wait "$pid" 2>/dev/null
sed 's/\x1b\[[0-9;]*m//g' "$log" | grep -E 'Found|Instrumented' | sed "s/^/$NAME: /"
rm -f "$log"
bash "$BENCH_HOME/prepare/state.sh" "$NAME" restore
