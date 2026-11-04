# Helpers for the cache / --incremental / --since scenarios (BUG-400..499).
# Usage: source this file, then call the functions. Requires node, npm, git.
#
# Layout:
#   /home/user/projects/cache/template-vitest  - template project, deps installed
#   /home/user/projects/cache/<scenario>       - fresh copy per scenario
#   /home/user/mootant/analysis/data/cache/    - raw JSON reports per run

set -u

CACHE_ROOT=${CACHE_ROOT:-/home/user/projects/cache}
DATA_DIR=${DATA_DIR:-/home/user/mootant/analysis/data/cache}
TEMPLATE_VITEST=${TEMPLATE_VITEST:-$CACHE_ROOT/template-vitest}
RUN_TIMEOUT=${RUN_TIMEOUT:-300}
mkdir -p "$DATA_DIR"

# new_project <name> [template]
# Copies the template (sources as files, node_modules as hard links), makes it
# a git repository with one commit, and prints its path.
new_project() {
  local name=$1
  local template=${2:-$TEMPLATE_VITEST}
  local dir=$CACHE_ROOT/$name
  rm -rf "$dir"
  mkdir -p "$dir"
  (cd "$template" && tar --exclude=./node_modules --exclude=./.git -cf - .) |
    (cd "$dir" && tar -xf -)
  if [ -d "$template/node_modules" ]; then
    cp -al "$template/node_modules" "$dir/node_modules"
    rm -rf "$dir/node_modules/.cache"
  fi
  (
    cd "$dir" &&
      git init -q -b main &&
      printf 'node_modules\n.mootant\n' >.gitignore &&
      git add -A &&
      git -c user.email=a@b -c user.name=fixture commit -q -m init
  )
  echo "$dir"
}

# run_mootant <dir> <label> [mootant run arguments...]
# Runs `mootant run --json --all --verbose` and saves the report as
# $DATA_DIR/<scenario>.<label>.json; prints one line per mutant:
# id status cached, then the diagnostics codes.
run_mootant() {
  local dir=$1
  local label=$2
  shift 2
  local scenario
  scenario=$(basename "$dir")
  local out=$DATA_DIR/$scenario.$label.json
  (cd "$dir" && timeout "$RUN_TIMEOUT" ./node_modules/.bin/mootant run --json --all --verbose "$@" >"$out" 2>"$out.stderr")
  local code=$?
  echo "[$scenario/$label] exit=$code args=$*"
  summarize "$out"
}

# summarize <report.json>
summarize() {
  node -e '
    const fs = require("fs")
    let text = fs.readFileSync(process.argv[1], "utf8")
    let report
    try { report = JSON.parse(text) } catch (error) {
      console.log("  (not JSON) " + text.slice(0, 300).replace(/\n/g, " | "))
      process.exit(0)
    }
    let mutants = report.mutants ?? []
    for (let m of mutants) {
      console.log(`  ${m.id} ${m.status.padEnd(10)} cached=${m.cached} ${m.file}:${m.line} ${m.mutator ?? ""} ${JSON.stringify(m.original ?? "").slice(0, 30)} -> ${JSON.stringify(m.replacement ?? "").slice(0, 30)}`)
    }
    let s = report.summary ?? {}
    console.log(`  summary: total=${s.totalMutants} killed=${s.totalKilled} survived=${s.totalSurvived} cached=${s.totalCached} score=${s.score}`)
    for (let d of report.diagnostics ?? []) {
      console.log(`  diag ${d.severity} ${d.code}: ${d.message}`)
    }
  ' "$1"
}

# verdicts <report.json> - prints "id status" lines, sorted, for diffing.
verdicts() {
  node -e '
    const r = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"))
    for (let m of (r.mutants ?? []).toSorted((a, b) => a.id < b.id ? -1 : 1)) console.log(m.id, m.status)
  ' "$1"
}

# compare_runs <scenario> <cachedLabel> <freshLabel>
# Prints mutants whose cached verdict differs from the fresh (--no-cache) one.
compare_runs() {
  local scenario=$1
  node -e '
    const fs = require("fs")
    let [a, b] = [process.argv[1], process.argv[2]].map(f => JSON.parse(fs.readFileSync(f, "utf8")))
    let fresh = new Map((b.mutants ?? []).map(m => [m.id, m]))
    let stale = 0
    for (let m of a.mutants ?? []) {
      let f = fresh.get(m.id)
      if (f && f.status !== m.status) {
        stale++
        console.log(`  STALE ${m.id} cached-run=${m.status} (cached=${m.cached}) fresh-run=${f.status} ${m.file}:${m.line}`)
      }
    }
    console.log(`  => ${stale} verdict(s) differ between the cached run and the fresh run`)
  ' "$DATA_DIR/$scenario.$2.json" "$DATA_DIR/$scenario.$3.json"
}

commit_all() {
  local dir=$1
  local message=$2
  (cd "$dir" && git add -A && git -c user.email=a@b -c user.name=fixture commit -q -m "$message")
}
