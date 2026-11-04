# Common environment of the benchmark scripts; source it, do not run it.
# Every path can be overridden from the environment.

BENCH_HOME=${BENCH_HOME:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}
BENCH_PROJECTS=${BENCH_PROJECTS:-/home/user/projects/bench}
BENCH_RESULTS=${BENCH_RESULTS:-$BENCH_PROJECTS/results}
MOOTANT_TGZ=${MOOTANT_TGZ:-/home/user/artifacts/mootant-0.1.0-170ec52.tgz}
# Commit of Mootant under study; the tarball above is `pnpm pack` of it.
MOOTANT_SHA=${MOOTANT_SHA:-170ec52}
STRYKER_VERSION=${STRYKER_VERSION:-10.1.1}
# Same parallelism for both tools: `--concurrency 3` / `"concurrency": 3`.
BENCH_CONCURRENCY=${BENCH_CONCURRENCY:-3}
# Resolution date for projects without a lockfile (npm --before).
BENCH_BEFORE=${BENCH_BEFORE:-2026-11-03T00:00:00Z}

# pnpm 12 lives here; the system pnpm 10 cannot read the newer lockfiles.
export PATH=/home/user/tools/bin:$PATH
# No colors, no interactive progress, no telemetry.
export NO_COLOR=1 FORCE_COLOR=0 CI=1
export STRYKER_TELEMETRY_DISABLE=true
export npm_config_fund=false npm_config_audit=false npm_config_update_notifier=false
# Leftovers from a profiling shell would change every measurement.
unset NODE_OPTIONS

bench_die() {
  echo "error: $*" >&2
  exit 1
}

# bench_project NAME: loads projects/NAME/project.sh and sets PROJECT_DIR.
bench_project() {
  local name=$1
  local file=$BENCH_HOME/projects/$name/project.sh
  [ -f "$file" ] || bench_die "unknown project $name ($file)"
  # Defaults that a project file may override.
  NAME=$name
  PM=npm
  RUNNER=vitest
  MUTATE=()
  EDIT_FILE=
  EDIT_FROM=
  EDIT_TO=
  SINCE_FILE=
  SINCE_FROM=
  SINCE_TO=
  TSC_CHECKER=0
  # Mootant's CLI as the project installed it (a devDependency, as
  # adapters/vitest/check-vitest-copy.ts requires).
  MOOTANT_BIN=node_modules/mootant/bin/mootant.js
  # Ignored paths that prepare/state.sh keeps besides node_modules (a build).
  CLEAN_KEEP=()
  unset PROFILE_MUTATE
  # shellcheck source=/dev/null
  . "$file"
  # BENCH_SUBSET=1: the small subset of smoke runs and profiles.
  if [ "${BENCH_SUBSET:-0}" = 1 ] && declare -p PROFILE_MUTATE >/dev/null 2>&1; then
    MUTATE=("${PROFILE_MUTATE[@]}")
  fi
  PROJECT_DIR=$BENCH_PROJECTS/$NAME
  PROJECT_CONF=$BENCH_HOME/projects/$NAME
}

bench_list_projects() {
  local dir
  for dir in "$BENCH_HOME"/projects/*/; do
    basename "$dir"
  done
}

# Prints the versions that every result must be read with.
bench_versions() {
  echo "date: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "host: $(nproc) vCPU, $(grep -m1 'model name' /proc/cpuinfo | cut -d: -f2 | sed 's/^ *//'), $(free -g | awk '/Mem:/ {print $2}') GB RAM"
  echo "kernel: $(uname -r)"
  echo "node: $(node -v), npm $(npm -v), pnpm $(pnpm -v)"
  echo "hyperfine: $(hyperfine --version | cut -d' ' -f2)"
  echo "mootant: $MOOTANT_SHA ($(basename "$MOOTANT_TGZ"))"
  echo "stryker: $STRYKER_VERSION"
  echo "load: $(cut -d' ' -f1-3 /proc/loadavg)"
}
