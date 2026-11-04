#!/usr/bin/env bash
# Builds the bench from scratch, one command per machine:
#   analysis/bench/setup.sh            # every project
#   analysis/bench/setup.sh cheerio    # some of them
# For every project (projects/<name>/project.sh): clone into
# $BENCH_PROJECTS/<name>, check out the pinned SHA, install its dependencies
# from its lockfile, add the Mootant tarball and Stryker, apply
# projects/<name>/patch.sh when there is one, copy the bench configurations,
# commit all of it on the local branch bench/base, commit edit.patch on top as
# bench/since (the synthetic commit of the --since point), run the test suite
# once and record the versions in $BENCH_RESULTS/setup/<name>.txt.
# Options: --force re-installs a project that is already set up;
#          --no-verify skips the test suite run.
set -euo pipefail
. "$(dirname "$0")/lib/env.sh"

force=0
verify=1
projects=()
for arg in "$@"; do
  case $arg in
    --force) force=1 ;;
    --no-verify) verify=0 ;;
    -*) bench_die "unknown option $arg" ;;
    *) projects+=("$arg") ;;
  esac
done
[ ${#projects[@]} -gt 0 ] || mapfile -t projects < <(bench_list_projects)
[ -f "$MOOTANT_TGZ" ] || bench_die "no Mootant tarball at $MOOTANT_TGZ"
mkdir -p "$BENCH_PROJECTS" "$BENCH_RESULTS/setup"

git_bench() {
  git -c user.name=bench -c user.email=bench@localhost -c commit.gpgsign=false "$@"
}

setup_project() {
  bench_project "$1"
  local log=$BENCH_RESULTS/setup/$NAME.txt
  echo "== $NAME ($SHA)"
  if [ ! -d "$PROJECT_DIR/.git" ]; then
    git clone -q "$REPO" "$PROJECT_DIR"
  fi
  cd "$PROJECT_DIR"
  if git rev-parse -q --verify bench/base >/dev/null && [ $force = 0 ]; then
    echo "already set up (bench/base exists); --force to redo"
    return
  fi
  git cat-file -e "$SHA^{commit}" 2>/dev/null || git fetch -q origin
  git checkout -q -f --detach "$SHA"
  git clean -q -fdx
  local started=$SECONDS
  install_deps
  add_tools
  if [ -f "$PROJECT_CONF/patch.sh" ]; then
    # shellcheck source=/dev/null
    . "$PROJECT_CONF/patch.sh"
  fi
  # What the tools write, and the Stryker configurations, which
  # prepare/state.sh writes again from project.sh before every run.
  printf '%s\n' .stryker-tmp reports .mootant stryker.log 'stryker.bench*.json' \
    >>.git/info/exclude
  git_bench checkout -q -B bench/base
  git_bench add -A
  git_bench commit -q -m "bench: Mootant tarball, Stryker $STRYKER_VERSION, configurations" --allow-empty
  git_bench checkout -q -B bench/since
  git apply "$PROJECT_CONF/edit.patch"
  git_bench commit -q -am "bench: synthetic change for --since"
  git_bench checkout -q bench/base
  bash "$BENCH_HOME/prepare/state.sh" "$NAME" clean
  {
    echo "project: $NAME"
    echo "repo: $REPO"
    echo "sha: $SHA"
    echo "bench/base: $(git rev-parse bench/base)"
    echo "bench/since: $(git rev-parse bench/since)"
    echo "install: $((SECONDS - started)) s"
    echo "node_modules: $(du -sh node_modules 2>/dev/null | cut -f1)"
    bench_versions
    echo "--- packages"
    for package in mootant vitest vite @stryker-mutator/core @stryker-mutator/vitest-runner \
      @stryker-mutator/tap-runner @stryker-mutator/typescript-checker typescript; do
      if [ -f "node_modules/$package/package.json" ]; then
        echo "$package $(node -p "require('./node_modules/$package/package.json').version")"
      fi
    done
  } >"$log"
  if [ $verify = 1 ]; then
    echo "test suite: ${TEST_CMD[*]}"
    if "${TEST_CMD[@]}" >"$BENCH_RESULTS/setup/$NAME.test.log" 2>&1; then
      echo "test suite: passed" | tee -a "$log"
    else
      echo "test suite: FAILED (see $BENCH_RESULTS/setup/$NAME.test.log)" | tee -a "$log"
    fi
  fi
  cat "$log"
}

for project in "${projects[@]}"; do
  (setup_project "$project")
done
