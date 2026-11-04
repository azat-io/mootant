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
TMP=$OUT/tmp-$k
if [ "$TOOL" = mootant ]; then
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
for helper in "${helpers[@]}"; do
  wait "$helper"
done

case $TOOL in
  mootant)
    mv "$OUT/run-$k.out" "$OUT/run-$k.json"
    leaked=$(find "$TMP" -mindepth 1 -maxdepth 1 -name 'mootant-*' | wc -l)
    rm -rf "$TMP"
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
