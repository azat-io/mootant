#!/usr/bin/env bash
# Measures a speed-up prototype on the bench of analysis/bench (exclusive window
# only): installs the prototype's tarball into the bench project (use-mootant.sh),
# runs the given points of analysis/bench/run.sh twice with the same build —
# "off" without the prototype's variable, "on" with it — into results
# directories of their own, compares the verdicts of every run of "on" with
# run 1 of "off" (compare-verdicts.mjs), and puts the build of the bench back.
#
# Usage: bench-proto.sh <prototype> <project> <point>...
#   prototype: parallel-units | trim-units | trim-units-covering | dry-snapshot
#   project:   path-to-regexp | cheerio | perfectionist | fast-json-stringify
#   point:     m-cold | m-warm | m-fast | m-edit | m-edit-inc ... (run.sh)
# Example:
#   analysis/tools/perf-proto/bench-proto.sh parallel-units path-to-regexp m-cold
#   BENCH_RUNS=5 analysis/tools/perf-proto/bench-proto.sh dry-snapshot cheerio m-cold m-warm m-edit
# Results: $BENCH_PROJECTS/results-proto/<prototype>/{off,on}/<project>/<point>/
# and .../compare-<project>-<point>.md; summarize each with
#   node analysis/bench/summarize.mjs $BENCH_PROJECTS/results-proto/<prototype>/on
# BENCH_DRY=1 prints what would run, without installing or running anything.
# BENCH_PROTO_MODES="on" skips the "off" runs (default "off on"); verdicts are
# then compared with run 1 of the main bench ($BENCH_RESULTS/<project>/<point>,
# the base tarball), when it exists. BENCH_RUNS sets the runs per point (run.sh).
set -uo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
BENCH=$(cd "$HERE/../../bench" && pwd)
. "$BENCH/lib/env.sh"
PROTO=${1:?prototype}
PROJECT=${2:?project}
shift 2
POINTS=("$@")
[ ${#POINTS[@]} -gt 0 ] || bench_die "no points"
case $PROTO in
  parallel-units) TGZ_DIR=proto-parallel-units VAR=MOOTANT_PARALLEL_UNITS VALUE=1 ;;
  trim-units) TGZ_DIR=proto-trim-units VAR=MOOTANT_TRIM_UNITS VALUE=prefix ;;
  trim-units-covering) TGZ_DIR=proto-trim-units VAR=MOOTANT_TRIM_UNITS VALUE=covering ;;
  dry-snapshot) TGZ_DIR=proto-dry-snapshot VAR=MOOTANT_REUSE_DRY_RUN VALUE=1 ;;
  *) bench_die "unknown prototype $PROTO" ;;
esac
TGZ=$(ls /home/user/artifacts/$TGZ_DIR/mootant-*.tgz | head -1)
[ -f "$TGZ" ] || bench_die "no tarball in /home/user/artifacts/$TGZ_DIR"
bench_project "$PROJECT"
OUT=$BENCH_PROJECTS/results-proto/$PROTO
mkdir -p "$OUT"
restore() {
  "$HERE/use-mootant.sh" "$PROJECT_DIR" "$MOOTANT_TGZ" >/dev/null
}
DRY=${BENCH_DRY:-0}
if [ "$DRY" != 1 ]; then
  trap restore EXIT
  "$HERE/use-mootant.sh" "$PROJECT_DIR" "$TGZ"
fi
unset MOOTANT_PARALLEL_UNITS MOOTANT_TRIM_UNITS MOOTANT_REUSE_DRY_RUN
MODES=${BENCH_PROTO_MODES:-off on}
for mode in $MODES; do
  if [ "$mode" = on ]; then
    export "$VAR=$VALUE"
  fi
  targets=()
  for point in "${POINTS[@]}"; do
    targets+=("$PROJECT:$point")
  done
  echo "== $PROTO $mode ($VAR=${!VAR:-}) ${targets[*]}"
  if [ "$DRY" = 1 ]; then
    BENCH_RESULTS=$OUT/$mode bash "$BENCH/run.sh" --dry "${targets[@]}"
  else
    BENCH_RESULTS=$OUT/$mode bash "$BENCH/run.sh" "${targets[@]}"
  fi
done
unset "$VAR"
for point in "${POINTS[@]}"; do
  base=$OUT/off/$PROJECT/$point/run-1.json
  [ -f "$base" ] || base=$BENCH_RESULTS/$PROJECT/$point/run-1.json
  report=$OUT/compare-$PROJECT-$point.md
  : >"$report"
  for run in "$OUT"/on/"$PROJECT"/"$point"/run-*.json; do
    [ -f "$base" ] && [ -f "$run" ] || continue
    echo "### $(basename "$run") (on) vs $base" >>"$report"
    node "$HERE/../compare-verdicts.mjs" "$base" "$run" --label off,on >>"$report"
    echo >>"$report"
  done
  echo "verdicts: $report"
  grep -E 'Эквивалентны|НЕ эквивалентны' "$report" | sed 's/^/  /'
done
