#!/usr/bin/env bash
# One measured run, as hyperfine calls it: runs the command in the project
# under GNU time, samples the memory of the whole process tree (memtree.mjs)
# and, for Mootant on Vitest, traces the units of every run of the test runner
# (trace-units.mjs). Saves, with k = the next free run number:
#   run-k.json   report: stdout of `mootant run --json ...`, or the JSON report
#                of Stryker (reports/bench/mutation.json)
#   run-k.out    stdout (Stryker, test suites), run-k.err stderr
#   run-k.time   GNU time key=value (elapsed, user, sys, maxrss_kb, ...)
#   run-k.mem.json, run-k.units.json, run-k.meta.json
# Usage: measure-one.sh <out-dir> <mootant|stryker|plain> <project-dir> -- cmd...
# Env: BENCH_TRACE=0 turns the unit tracer off, BENCH_MEM=0 the sampler.
set -u
OUT=${1:?out dir}
TOOL=${2:?tool}
PROJ=${3:?project dir}
shift 3
[ "${1:-}" = "--" ] && shift
LIB=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
mkdir -p "$OUT"
k=1
while [ -e "$OUT/run-$k.time" ]; do k=$((k + 1)); done
: >"$OUT/run-$k.time"

TRACE=${BENCH_TRACE:-1}
MEM=${BENCH_MEM:-1}
# hyperfine gives every run a random-length variable; tests that list
# process.env (spread it, start a child process) make Mootant hash every
# variable into its cache keys (adapters/shared/index-environment-hashes.ts),
# so the variable would turn every warm run cold (BUG-701).
unset HYPERFINE_RANDOMIZED_ENVIRONMENT_OFFSET
# The same TMPDIR for every run of a project, for the same reason; emptied
# before each run, so the only mootant-* directory in it is this run's.
TMP=$(dirname "$(dirname "$OUT")")/tmp/$(basename "$PROJ")
if [ "$TOOL" = mootant ]; then
  rm -rf "$TMP"
  mkdir -p "$TMP"
  export TMPDIR=$TMP
fi
FMT='elapsed=%e
user=%U
sys=%S
maxrss_kb=%M
major_faults=%F
minor_faults=%R
voluntary_cs=%w
involuntary_cs=%c
exit=%x'
start=$(date +%s.%N)
(
  cd "$PROJ" || exit 1
  exec /usr/bin/time -f "$FMT" -o "$OUT/run-$k.time" "$@" >"$OUT/run-$k.out" 2>"$OUT/run-$k.err"
) &
pid=$!
helpers=()
if [ "$MEM" = 1 ]; then
  node "$LIB/memtree.mjs" "$pid" "$OUT/run-$k.mem.json" &
  helpers+=($!)
fi
if [ "$TOOL" = mootant ] && [ "$TRACE" = 1 ]; then
  node "$LIB/trace-units.mjs" "$TMP" "$OUT/run-$k.units.json" --pid "$pid" &
  helpers+=($!)
fi
wait "$pid"
code=$?
end=$(date +%s.%N)
# hyperfine times this whole script, so the helpers must stop at once. Left to
# themselves they notice the end only on their next poll (memtree.mjs once a
# second), and the wait for it added 0.2-1 s to every run of the window of
# 2026-11-04 (README, "Known limitations"). On SIGTERM both write their file
# and exit; a helper killed before its handler is set (a run shorter than
# node's start) leaves no file.
for helper in "${helpers[@]}"; do
  kill -TERM "$helper" 2>/dev/null
done
for helper in "${helpers[@]}"; do
  wait "$helper"
done

case $TOOL in
  mootant)
    mv "$OUT/run-$k.out" "$OUT/run-$k.json"
    leaked=$(find "$TMP" -mindepth 1 -maxdepth 1 -name 'mootant-*' | wc -l)
    ;;
  stryker)
    if [ -f "$PROJ/reports/bench/mutation.json" ]; then
      mv "$PROJ/reports/bench/mutation.json" "$OUT/run-$k.json"
    fi
    leaked=$(find "$PROJ/.stryker-tmp" -mindepth 1 -maxdepth 1 2>/dev/null | wc -l)
    ;;
  *)
    leaked=0
    ;;
esac
printf '{"run":%d,"tool":"%s","exit":%d,"start":%s,"end":%s,"leakedWorkDirs":%d,"cwd":"%s","command":"%s"}\n' \
  "$k" "$TOOL" "$code" "$start" "$end" "$leaked" "$PROJ" "$(printf '%s ' "$@" | sed 's/"/\\"/g; s/ $//')" \
  >"$OUT/run-$k.meta.json"
exit "$code"
