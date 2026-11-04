#!/usr/bin/env bash
# Puts a bench project into a known state before a measured run; hyperfine
# calls it as --prepare (before every run), --setup or --cleanup.
# Usage: state.sh <project> <state>
#   clean       branch bench/base, clean tree, no Mootant cache, no Stryker
#               sandbox, report or incremental file
#   warm        clean, then the Mootant cache of a full run on bench/base
#               (snapshot "mootant-cache"; primed with one untimed run if absent)
#   edit        warm + edit.patch applied to the working tree (uncommitted)
#   since       clean + branch bench/since (edit.patch committed on top)
#   stryker-inc-edit  clean + Stryker's incremental file of a full run on
#               bench/base (snapshot "stryker-incremental") + edit.patch
#   snapshot    saves the Mootant cache of the tree as it is
#   restore     back to bench/base after a point
set -euo pipefail
. "$(dirname "$0")/../lib/env.sh"
bench_project "${1:?project}"
STATE=${2:?state}
SNAP=$BENCH_RESULTS/snapshots/$NAME
cd "$PROJECT_DIR"

reset_tree() {
  git checkout -q -f bench/base
  git reset -q --hard bench/base
  # Only what the tools write; node_modules stays.
  git clean -q -fdx -e node_modules
  rm -rf node_modules/.cache/mootant node_modules/.vite node_modules/.vitest \
    .stryker-tmp reports/bench .mootant
  node "$BENCH_HOME/lib/make-stryker-config.mjs" "$PROJECT_CONF/stryker.json" . \
    "$BENCH_CONCURRENCY" "${MUTATE[@]}" >/dev/null
}

prime_mootant_cache() {
  echo "priming the Mootant cache of $NAME (untimed run)" >&2
  reset_tree
  node node_modules/mootant/bin/mootant.js run "${MUTATE[@]}" \
    --concurrency "$BENCH_CONCURRENCY" --json >/dev/null 2>"$SNAP.prime.err" || true
  save_mootant_cache
}

save_mootant_cache() {
  [ -d node_modules/.cache/mootant ] || bench_die "no Mootant cache in $PROJECT_DIR"
  mkdir -p "$SNAP"
  rm -rf "$SNAP/mootant-cache"
  cp -a node_modules/.cache/mootant "$SNAP/mootant-cache"
}

restore_mootant_cache() {
  [ -d "$SNAP/mootant-cache" ] || prime_mootant_cache
  reset_tree
  mkdir -p node_modules/.cache
  cp -a "$SNAP/mootant-cache" node_modules/.cache/mootant
}

restore_stryker_incremental() {
  if [ ! -f "$SNAP/stryker-incremental.json" ]; then
    echo "priming Stryker's incremental file of $NAME (untimed run)" >&2
    reset_tree
    node node_modules/@stryker-mutator/core/bin/stryker.js run stryker.bench.json \
      --incremental --incrementalFile reports/bench-incremental.json \
      >"$SNAP.stryker-prime.out" 2>&1 || true
    mkdir -p "$SNAP"
    cp reports/bench-incremental.json "$SNAP/stryker-incremental.json"
  fi
  reset_tree
  mkdir -p reports
  cp "$SNAP/stryker-incremental.json" reports/bench-incremental.json
}

apply_edit() {
  git apply "$PROJECT_CONF/edit.patch"
}

case $STATE in
  clean | restore) reset_tree ;;
  warm) restore_mootant_cache ;;
  edit)
    restore_mootant_cache
    apply_edit
    ;;
  since)
    reset_tree
    git checkout -q -f bench/since
    ;;
  stryker-inc-edit)
    restore_stryker_incremental
    apply_edit
    ;;
  snapshot) save_mootant_cache ;;
  *) bench_die "unknown state $STATE" ;;
esac
