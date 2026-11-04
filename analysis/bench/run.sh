#!/usr/bin/env bash
# Runs measurement points with hyperfine, in plan order (README, "Plan").
#   analysis/bench/run.sh                       # the whole plan
#   analysis/bench/run.sh --tier 1              # only the points of tier 1
#   analysis/bench/run.sh cheerio:m-cold cheerio:s-cold
#   analysis/bench/run.sh --runs 1 --dry path-to-regexp:m-cold   # print only
# Every point writes $BENCH_RESULTS/<project>/<point>/: hyperfine.json and,
# per run, run-k.{json,out,err,time,mem.json,units.json,meta.json}
# (lib/measure-one.sh). A point that already has hyperfine.json is skipped
# unless --redo is given, so an interrupted plan resumes where it stopped.
set -uo pipefail
. "$(dirname "$0")/lib/env.sh"

RUNS=${BENCH_RUNS:-3}
tier_max=9
dry=0
redo=0
wanted=()
while [ $# -gt 0 ]; do
  case $1 in
    --runs) RUNS=$2; shift ;;
    --tier) tier_max=$2; shift ;;
    --dry) dry=1 ;;
    --redo) redo=1 ;;
    -*) bench_die "unknown option $1" ;;
    *) wanted+=("$1") ;;
  esac
  shift
done

# The plan: tier, project, point. Tier 1 is the headline comparison, so it
# runs first; later tiers add the modes, then the extras (README, "Plan").
PLAN=$(cat <<'EOF'
1 perfectionist test
1 perfectionist m-cold
1 perfectionist s-cold
1 path-to-regexp test
1 path-to-regexp m-cold
1 path-to-regexp s-cold
1 cheerio test
1 cheerio m-cold
1 cheerio s-cold
1 fast-json-stringify test
1 fast-json-stringify m-cold
1 fast-json-stringify s-cold
2 perfectionist m-one
2 path-to-regexp m-one
2 cheerio m-one
2 fast-json-stringify m-one
2 perfectionist m-warm
2 path-to-regexp m-warm
2 cheerio m-warm
2 fast-json-stringify m-warm
2 perfectionist m-fast
2 path-to-regexp m-fast
2 cheerio m-fast
3 perfectionist m-edit-inc
3 path-to-regexp m-edit-inc
3 cheerio m-edit-inc
3 fast-json-stringify m-edit-inc
3 perfectionist m-since
3 path-to-regexp m-since
3 cheerio m-since
3 fast-json-stringify m-since
4 perfectionist m-edit
4 path-to-regexp m-edit
4 cheerio m-edit
4 fast-json-stringify m-edit
4 perfectionist m-list-text
4 perfectionist m-list-json
4 path-to-regexp m-list-text
4 path-to-regexp m-list-json
4 cheerio m-list-text
4 cheerio m-list-json
4 fast-json-stringify m-list-text
4 fast-json-stringify m-list-json
5 cheerio s-tsc
5 perfectionist s-tsc
5 path-to-regexp s-edit-inc
5 cheerio s-edit-inc
5 path-to-regexp m-nocache
5 cheerio m-nocache
6 fast-json-stringify s-command
6 mootant-self m-one
6 mootant-self m-cold
6 mootant-self m-warm
EOF
)

mootant_run() {
  echo node "$MOOTANT_BIN" run "${MUTATE[@]}" \
    --concurrency "$BENCH_CONCURRENCY" --json --all --verbose "$@"
}

# Id of the first listed mutant. `--mutant <id>` is the re-check of one
# mutant, as an agent runs it after writing a test: startup, the dry run of
# the tests related to the file of that mutant (only files with a selected
# mutant are switched, core/run-mutants.ts:633-664 and :379-393; the dry run
# hosts every mutant of those files, :340-342) and one mutant.
first_mutant() {
  [ -d "$PROJECT_DIR" ] || return 0
  (cd "$PROJECT_DIR" && node "$MOOTANT_BIN" list "${MUTATE[@]}" --json 2>/dev/null) |
    node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log(JSON.parse(s).mutants[0]?.id??"")}catch{console.log("")}})'
}

stryker_run() {
  echo node node_modules/@stryker-mutator/core/bin/stryker.js run "$@"
}

# Sets KIND, CMD, PREPARE, SETUP, CLEANUP, POINT_RUNS for a point.
define_point() {
  local point=$1
  local state="bash $BENCH_HOME/prepare/state.sh $NAME"
  KIND=mootant
  PREPARE="$state clean"
  SETUP=
  CLEANUP="$state restore"
  POINT_RUNS=$RUNS
  case $point in
    test)
      KIND=plain
      CMD="${TEST_CMD[*]}"
      POINT_RUNS=${BENCH_TEST_RUNS:-5}
      SETUP="${TEST_CMD[*]} >/dev/null 2>&1 || true" # warms the page cache
      ;;
    m-cold)
      CMD=$(mootant_run)
      CLEANUP="$state snapshot; $state restore"
      # Dogfood core/text did not finish in 42 minutes (00-baseline.md).
      if [ "$NAME" = mootant-self ]; then POINT_RUNS=${BENCH_LONG_RUNS:-1}; fi
      ;;
    m-nocache) CMD=$(mootant_run --no-cache) ;;
    m-one)
      local id
      id=$(first_mutant)
      [ -n "$id" ] || return 1
      CMD=$(mootant_run --no-cache --mutant "$id")
      ;;
    m-fast) CMD=$(mootant_run --fast) ;;
    m-warm)
      CMD=$(mootant_run)
      PREPARE="$state warm"
      ;;
    m-edit)
      CMD=$(mootant_run)
      PREPARE="$state edit"
      ;;
    m-edit-inc)
      CMD=$(mootant_run --incremental)
      PREPARE="$state edit"
      ;;
    m-since)
      CMD=$(mootant_run --since bench/base)
      PREPARE="$state since"
      ;;
    m-list-text | m-list-json)
      KIND=plain
      POINT_RUNS=${BENCH_TEST_RUNS:-5}
      CMD="node $MOOTANT_BIN list ${MUTATE[*]}"
      if [ "$point" = m-list-json ]; then CMD="$CMD --json"; fi
      ;;
    s-cold)
      KIND=stryker
      CMD=$(stryker_run stryker.bench.json)
      ;;
    s-tsc)
      KIND=stryker
      [ "$TSC_CHECKER" = 1 ] || return 1
      CMD=$(stryker_run stryker.bench.tsc.json)
      ;;
    s-edit-inc)
      KIND=stryker
      CMD=$(stryker_run stryker.bench.json --incremental --incrementalFile reports/bench-incremental.json)
      PREPARE="$state stryker-inc-edit"
      ;;
    s-command)
      KIND=stryker
      [ -f "$PROJECT_CONF/stryker.command.json" ] || return 1
      CMD=$(stryker_run stryker.bench.command.json)
      # The whole suite per mutant: hours for three runs (README, "Plan").
      POINT_RUNS=${BENCH_LONG_RUNS:-1}
      ;;
    *) return 1 ;;
  esac
}

selected() {
  local project=$1 point=$2 tier=$3
  [ "$tier" -le "$tier_max" ] || return 1
  [ ${#wanted[@]} -eq 0 ] && return 0
  local item
  for item in "${wanted[@]}"; do
    [ "$item" = "$project:$point" ] || [ "$item" = "$project" ] || [ "$item" = "$point" ] && return 0
  done
  return 1
}

mkdir -p "$BENCH_RESULTS"
bench_versions >"$BENCH_RESULTS/versions-$(date -u +%Y%m%dT%H%M%S).txt"
while read -r tier project point; do
  [ -n "$tier" ] || continue
  selected "$project" "$point" "$tier" || continue
  bench_project "$project"
  if ! define_point "$point"; then
    echo "skip $project:$point (not defined for this project)"
    continue
  fi
  out=$BENCH_RESULTS/$project/$point
  # hyperfine creates its export file when it starts, so an interrupted point
  # leaves it empty: only a non-empty one means the point is done.
  if [ -s "$out/hyperfine.json" ] && [ $redo = 0 ]; then
    echo "done already: $project:$point"
    continue
  fi
  measure="bash $BENCH_HOME/lib/measure-one.sh $out $KIND $PROJECT_DIR --"
  args=(--runs "$POINT_RUNS" --ignore-failure --style basic
    --export-json "$out/hyperfine.json" --command-name "$project:$point")
  [ -n "$SETUP" ] && args+=(--setup "cd $PROJECT_DIR && $SETUP")
  [ -n "$PREPARE" ] && args+=(--prepare "$PREPARE")
  [ -n "$CLEANUP" ] && args+=(--cleanup "$CLEANUP")
  echo "== tier $tier $project:$point x$POINT_RUNS: $CMD"
  [ $dry = 1 ] && continue
  if [ $redo = 1 ]; then rm -rf "$out"; fi
  mkdir -p "$out"
  echo "start $(date -u +%H:%M:%S) load $(cut -d' ' -f1-3 /proc/loadavg)" >"$out/point.log"
  hyperfine "${args[@]}" "$measure $CMD" 2>&1 | tee -a "$out/point.log"
  echo "end $(date -u +%H:%M:%S) load $(cut -d' ' -f1-3 /proc/loadavg)" >>"$out/point.log"
done <<<"$PLAN"
