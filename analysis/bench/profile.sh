#!/usr/bin/env bash
# CPU profiles and phase breakdowns of one project (not timed runs: profiling
# slows the processes down by 5–15 %).
#   analysis/bench/profile.sh <project> [mode...]
# Modes (default: list run vitest):
#   list     `mootant list` (text and --json) under --cpu-prof: file search,
#            parsing, mutant generation, heuristics, report formatting
#   run      `mootant run --no-cache` under --cpu-prof (execArgv and
#            NODE_OPTIONS): the main process and every Vitest fork or node:test
#            process, split by pid (a worker killed by a signal writes no
#            profile; the summary says how many came back)
#   vitest   the plain test runner on the whole suite with its own breakdown
#            (Vitest prints transform/setup/import/tests/environment)
# Paths: PROFILE_MUTATE of project.sh when set (a smaller subset), else MUTATE.
# Output: $BENCH_RESULTS/profiles/<project>/<mode>/ and summary.md next to it.
set -uo pipefail
. "$(dirname "$0")/lib/env.sh"
bench_project "${1:?project}"
shift
modes=("$@")
[ ${#modes[@]} -gt 0 ] || modes=(list run vitest)
paths=("${MUTATE[@]}")
if declare -p PROFILE_MUTATE >/dev/null 2>&1; then paths=("${PROFILE_MUTATE[@]}"); fi
OUT=$BENCH_RESULTS/profiles/$NAME
TOP="node $BENCH_HOME/lib/cpuprofile-top.mjs"
MOOTANT=$MOOTANT_BIN
STATE="bash $BENCH_HOME/prepare/state.sh $NAME"
# Inclusive time of the phases of the main process, by module file: the dist
# is minified, but every file exports one function (core/run-mutants.ts,
# core/files/list-file-mutants.ts, core/generate/generate-file-mutants.ts ...).
FOCUS_MAIN=core/run-mutants.js,core/config/prepare-run.js,core/files/list-file-mutants.js,core/files/expand-paths.js,core/generate/generate-file-mutants.js,core/generate/collect-candidates.js,core/generate/deduplicate-candidates.js,core/generate/apply-solitary-rule.js,core/generate/get-mutant-regions.js,core/identity/assign-mutant-ids.js,adapters/vitest/start-vitest-session.js,adapters/node-test/start-node-test-session.js,core/instrument/create-switched-files.js,core/run/run-dry-phase.js,core/run/read-dry-run.js,core/cache/prepare-run-cache.js,core/run/create-run-state.js,core/run/read-test-imports.js,core/run/run-batch-phases.js,core/run/run-isolated-rounds.js,adapters/vitest/run-plan.js,adapters/vitest/write-plan-files.js,adapters/vitest/read-out-files.js,adapters/vitest/collect-dependencies.js,adapters/vitest/read-unit-inputs.js,core/cache/save-run-cache.js,cli/report/build-run-report.js,cli/report/format-run-report.js,cli/report/build-list-report.js,cli/report/format-report.js,cli/terminal/get-display-width.js
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

profile_run() {
  # --cpu-prof on the main process reaches Vitest's forks through execArgv
  # (smoke: 33 profiles from one run); NODE_OPTIONS alone reached none of them,
  # but it is what node:test processes inherit. Both are set; the main
  # profile is told apart by its pid.
  local dir=$OUT/run
  rm -rf "$dir" && mkdir -p "$dir/tmp" "$dir/profile" "$dir/main" "$dir/workers"
  $STATE clean
  local started=$SECONDS
  TMPDIR=$dir/tmp NODE_OPTIONS="--cpu-prof --cpu-prof-dir=$dir/profile" \
    node --cpu-prof --cpu-prof-dir="$dir/profile" "$MOOTANT" run "${paths[@]}" \
    --concurrency "$BENCH_CONCURRENCY" --no-cache --json --all --verbose \
    >"$dir/run.json" 2>"$dir/run.err" &
  local pid=$!
  wait $pid
  local elapsed=$((SECONDS - started))
  mv "$dir"/profile/CPU.*."$pid".*.cpuprofile "$dir/main/" 2>/dev/null
  mv "$dir"/profile/*.cpuprofile "$dir/workers/" 2>/dev/null
  local summary_line
  summary_line=$(node -e '
    let r = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"))
    let s = r.summary
    let units = (s.staticCost ?? []).reduce((t, c) => t + c.units, 0)
    console.log("JSON timing, ms: " + JSON.stringify(s.duration) + "; mutants " + s.totalMutants + ", runs " + JSON.stringify(s.runs) + ", isolated units " + units)
  ' "$dir/run.json" 2>/dev/null || echo "(no JSON report)")
  {
    echo "## mootant run --no-cache under --cpu-prof: ${elapsed} s (profiling slows it down)"
    echo
    echo "$summary_line"
    echo
    echo "Profiles: main $(ls "$dir/main" | wc -l), other processes $(ls "$dir/workers" | wc -l) (a worker killed by a signal writes none)."
    echo
    echo "### Main process"
    echo
    $TOP --top 30 --focus "$FOCUS_MAIN" "$dir/main"
    echo "### Workers and test processes, merged"
    echo
    $TOP --top 30 --merge "$dir/workers"
    $TOP --top 40 --merge --by module "$dir/workers" | sed -n '/^| module/,$p' | head -45
    echo
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
