#!/usr/bin/env bash
# CPU profiles and phase breakdowns of one project (not timed runs: profiling
# slows the processes down by 5–15 %).
#   analysis/bench/profile.sh <project> [mode...]
# Modes (default: list main workers vitest):
#   list     `mootant list` (text and --json) under --cpu-prof: file search,
#            parsing, mutant generation, heuristics, report formatting
#   main     `mootant run --no-cache` with --cpu-prof on the main process only
#   workers  the same with NODE_OPTIONS=--cpu-prof: every node process, Vitest
#            forks and node:test processes included (a worker killed by a
#            signal writes no profile; the summary says how many came back)
#   vitest   the plain test runner on the whole suite with its own breakdown
#            (Vitest prints transform/setup/import/tests/environment)
# Paths: PROFILE_MUTATE of project.sh when set (a smaller subset), else MUTATE.
# Output: $BENCH_RESULTS/profiles/<project>/<mode>/ and summary.md next to it.
set -uo pipefail
. "$(dirname "$0")/lib/env.sh"
bench_project "${1:?project}"
shift
modes=("$@")
[ ${#modes[@]} -gt 0 ] || modes=(list main workers vitest)
paths=("${MUTATE[@]}")
if declare -p PROFILE_MUTATE >/dev/null 2>&1; then paths=("${PROFILE_MUTATE[@]}"); fi
OUT=$BENCH_RESULTS/profiles/$NAME
TOP="node $BENCH_HOME/lib/cpuprofile-top.mjs"
MOOTANT=node_modules/mootant/bin/mootant.js
STATE="bash $BENCH_HOME/prepare/state.sh $NAME"
# Inclusive time of the phases of the main process (core/run-mutants.ts,
# core/files/list-file-mutants.ts, core/generate/generate-file-mutants.ts).
FOCUS_MAIN=runMutants,prepareRun,listFileMutants,expandPaths,generateFileMutants,prepareFilePrograms,collectFileCandidates,deduplicateCandidates,applySolitaryRule,assignMutantIds,getMutantRegions,startVitestSession,startNodeTestSession,createSwitchedFiles,runDryPhase,readDryRun,prepareRunCache,createRunState,readTestImports,runBatchPhases,runIsolatedRounds,runPlan,writePlanFiles,readOutFiles,collectDependencies,readUnitInputs,saveRunCache,buildRunReport,formatRunReport,buildListReport,formatReport
mkdir -p "$OUT"
cd "$PROJECT_DIR" || exit 1
summary=$OUT/summary.md
{
  echo "# Profiles of $NAME"
  echo
  bench_versions | sed 's/^/    /'
  echo
  echo "Paths: ${paths[*]}"
  echo
} >"$summary"

profile_list() {
  local dir=$OUT/list
  rm -rf "$dir" && mkdir -p "$dir"
  $STATE clean
  local format
  for format in text json; do
    local extra=()
    [ $format = json ] && extra=(--json)
    /usr/bin/time -f '%e s, %M KB' -o "$dir/$format.time" \
      node --cpu-prof --cpu-prof-dir="$dir/$format" "$MOOTANT" list "${paths[@]}" "${extra[@]}" \
      >"$dir/$format.out" 2>"$dir/$format.err"
    {
      echo "## mootant list ($format): $(cat "$dir/$format.time"), $(wc -l <"$dir/$format.out") lines of output"
      echo
      $TOP --top 20 --focus "$FOCUS_MAIN" "$dir/$format"
    } >>"$summary"
  done
}

profile_main() {
  local dir=$OUT/main
  rm -rf "$dir" && mkdir -p "$dir/tmp"
  $STATE clean
  TMPDIR=$dir/tmp /usr/bin/time -f '%e s, %M KB' -o "$dir/run.time" \
    node --cpu-prof --cpu-prof-dir="$dir/profile" "$MOOTANT" run "${paths[@]}" \
    --concurrency "$BENCH_CONCURRENCY" --no-cache --json --all --verbose \
    >"$dir/run.json" 2>"$dir/run.err"
  {
    echo "## mootant run, main process: $(cat "$dir/run.time")"
    echo
    node -e '
      let r = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"))
      let d = r.summary.duration
      console.log("JSON timing, ms: " + JSON.stringify(d) + "; mutants " + r.summary.totalMutants + ", runs " + JSON.stringify(r.summary.runs))
    ' "$dir/run.json" || echo "(no JSON report)"
    echo
    $TOP --top 30 --focus "$FOCUS_MAIN" "$dir/profile"
  } >>"$summary"
}

profile_workers() {
  local dir=$OUT/workers
  rm -rf "$dir" && mkdir -p "$dir/tmp" "$dir/profile"
  $STATE clean
  local started=$SECONDS
  TMPDIR=$dir/tmp NODE_OPTIONS="--cpu-prof --cpu-prof-dir=$dir/profile" \
    node "$MOOTANT" run "${paths[@]}" --concurrency "$BENCH_CONCURRENCY" \
    --no-cache --json --all --verbose >"$dir/run.json" 2>"$dir/run.err" &
  local pid=$!
  wait $pid
  local elapsed=$((SECONDS - started))
  mkdir -p "$dir/main" "$dir/other"
  mv "$dir"/profile/CPU.*."$pid".*.cpuprofile "$dir/main/" 2>/dev/null
  mv "$dir"/profile/*.cpuprofile "$dir/other/" 2>/dev/null
  local units
  units=$(node -e '
    let r = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"))
    console.log((r.summary.staticCost ?? []).reduce((t, c) => t + c.units, 0))
  ' "$dir/run.json" 2>/dev/null || echo "?")
  {
    echo "## mootant run, every process (NODE_OPTIONS=--cpu-prof): ${elapsed} s"
    echo
    echo "Profiles: main $(ls "$dir/main" | wc -l), other processes $(ls "$dir/other" | wc -l); isolated units in the report: $units (plus the dry run's test files)."
    echo
    $TOP --top 30 --merge "$dir/other"
    $TOP --top 30 --merge --by module "$dir/other" | sed -n '/^| module/,$p' | head -40
  } >>"$summary"
}

profile_vitest() {
  local dir=$OUT/vitest
  rm -rf "$dir" && mkdir -p "$dir"
  $STATE clean
  if [ "$RUNNER" = vitest ]; then
    # The default reporter prints "Duration ... (transform, setup, import,
    # tests, environment)"; NO_COLOR keeps the line plain.
    /usr/bin/time -f '%e s, %M KB' -o "$dir/vitest.time" \
      "${TEST_CMD[@]}" --reporter=default >"$dir/vitest.out" 2>&1
    {
      echo "## ${TEST_CMD[*]}: $(cat "$dir/vitest.time")"
      echo
      echo '```'
      grep -E 'Test Files|Tests |Duration|Start at' "$dir/vitest.out"
      echo '```'
      echo
    } >>"$summary"
  else
    /usr/bin/time -f '%e s, %M KB' -o "$dir/node-test.time" \
      "${TEST_CMD[@]}" --test-reporter=spec >"$dir/node-test.out" 2>&1
    {
      echo "## ${TEST_CMD[*]}: $(cat "$dir/node-test.time")"
      echo
      echo '```'
      tail -n 9 "$dir/node-test.out"
      echo '```'
      echo
    } >>"$summary"
  fi
}

for mode in "${modes[@]}"; do
  echo "== $NAME: $mode"
  "profile_$mode"
done
$STATE restore
echo "summary: $summary"
