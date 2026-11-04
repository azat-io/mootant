#!/usr/bin/env bash
# --since scenarios. They use `mootant list --since <ref> --json --verbose`,
# which selects mutants the same way `run` does (readChangedLines +
# selectChangedMutants) without starting a test runner, plus a few `run`
# checks for error paths. Usage: s-since.sh <scenario>...
# Output: stdout and $DATA_DIR/since-<scenario>.*.json

source "$(dirname "$0")/lib.sh"

# list_since <dir> <label> <ref> [extra args] - prints "file:line id" of the
# selected mutants and the exit code.
list_since() {
  local dir=$1 label=$2 ref=$3
  shift 3
  local out=$DATA_DIR/$(basename "$dir").$label.json
  (cd "$dir" && timeout 120 ./node_modules/.bin/mootant list src --since "$ref" --json --verbose "$@" >"$out" 2>"$out.stderr")
  local code=$?
  echo "  [$label] --since $ref exit=$code"
  node -e '
    const fs = require("fs")
    let text = fs.readFileSync(process.argv[1], "utf8")
    let r
    try { r = JSON.parse(text) } catch { console.log("    (not JSON) " + text.slice(0, 300)); process.exit(0) }
    let byFile = new Map()
    for (let m of r.mutants ?? []) {
      let lines = byFile.get(m.file) ?? new Set()
      lines.add(m.line)
      byFile.set(m.file, lines)
    }
    for (let [file, lines] of byFile) console.log(`    ${JSON.stringify(file)}: lines ${[...lines].join(",")}`)
    if (byFile.size === 0) console.log("    (no mutants selected)")
    for (let d of r.diagnostics ?? []) console.log(`    diag ${d.severity} ${d.code}: ${d.message}`)
  ' "$out"
  if [ -s "$out.stderr" ]; then sed 's/^/    stderr: /' "$out.stderr" | head -5; fi
}

# A source file with one mutant per line (lines 1..6), so selected lines are
# easy to read: every "x > N" is a comparison-operator mutant.
write_lines() {
  local file=$1
  cat >"$file" <<'EOF'
export const a = (x: number) => x > 1
export const b = (x: number) => x > 2
export const c = (x: number) => x > 3
export const d = (x: number) => x > 4
export const e = (x: number) => x > 5
export const f = (x: number) => x > 6
EOF
}

since_project() {
  local name=$1
  local d
  d=$(new_project "since-$name")
  rm -rf "$d/src/math.ts" "$d/test"
  write_lines "$d/src/lines.ts"
  commit_all "$d" base
  echo "$d"
}

git_c() { git -c user.email=a@b -c user.name=fixture "$@"; }

rename_committed() {
  local d
  d=$(since_project rename-committed)
  (cd "$d" && git checkout -q -b feature && git mv src/lines.ts src/renamed.ts && git_c commit -q -m rename)
  echo "  EXPECT (by the documented rule 'lines changed'): nothing; a pure rename changes no line"
  list_since "$d" pure main
  (cd "$d" && sed -i 's/x > 3/x >= 3/' src/renamed.ts && git_c commit -qam edit)
  echo "  EXPECT: line 3 only"
  list_since "$d" edited main
}

rename_unstaged() {
  local d
  d=$(since_project rename-unstaged)
  (cd "$d" && mv src/lines.ts src/renamed.ts)
  echo "  EXPECT: same as a staged rename (nothing); actual: an untracked file counts whole"
  list_since "$d" mv main
  (cd "$d" && git add -A)
  list_since "$d" staged main
}

staged_unstaged_untracked() {
  local d
  d=$(since_project states)
  (cd "$d" && sed -i 's/x > 2/x >= 2/' src/lines.ts && git add src/lines.ts && sed -i 's/x > 5/x >= 5/' src/lines.ts)
  write_lines "$d/src/untracked.ts"
  mkdir -p "$d/src/generated" && write_lines "$d/src/generated/ignored.ts" && echo 'src/generated' >>"$d/.gitignore"
  echo "  EXPECT: lines.ts 2 (staged) and 5 (unstaged); untracked.ts whole; generated/ignored.ts: ? (docs say untracked files)"
  list_since "$d" mixed HEAD
}

deleted_lines() {
  local d
  d=$(since_project deleted-lines)
  (cd "$d" && sed -i '3d' src/lines.ts)
  echo "  EXPECT: lines around the gap: new lines 2 and 3 (old b and d)"
  list_since "$d" middle HEAD
  (cd "$d" && git checkout -q src/lines.ts && sed -i '6d' src/lines.ts)
  echo "  EXPECT: new line 5 (the line before the gap at the end)"
  list_since "$d" end HEAD
}

merge_commits() {
  local d
  d=$(since_project merges)
  (
    cd "$d" &&
      git checkout -q -b feature &&
      sed -i 's/x > 2/x >= 2/' src/lines.ts && git_c commit -qam 'feature: b' &&
      git checkout -q main &&
      sed -i 's/x > 6/x >= 6/' src/lines.ts && git_c commit -qam 'main: f' &&
      git checkout -q feature && git_c merge -q --no-edit main &&
      git checkout -q main &&
      sed -i 's/x > 4/x >= 4/' src/lines.ts && git_c commit -qam 'main: d (after merge)' &&
      git checkout -q feature
  )
  echo "  EXPECT: line 2 only (feature's change; f came from main through the merge, d is only on main)"
  list_since "$d" merged main
}

shallow_clone() {
  local d
  d=$(since_project shallow-origin)
  (cd "$d" && sed -i 's/x > 2/x >= 2/' src/lines.ts && git_c commit -qam two && sed -i 's/x > 3/x >= 3/' src/lines.ts && git_c commit -qam three)
  local clone=$CACHE_ROOT/since-shallow-clone
  rm -rf "$clone"
  git clone -q --depth 1 "file://$d" "$clone"
  cp -al "$TEMPLATE_VITEST/node_modules" "$clone/node_modules"
  echo "  EXPECT: a hint that the clone is shallow"
  list_since "$clone" head1 HEAD~1
  list_since "$clone" originmain origin/main
  # CI-like: the PR branch is cloned with depth 1, then the base branch is
  # fetched with depth 1 (main moved on after the branch point).
  (cd "$d" && git checkout -q -b feature && sed -i 's/x > 5/x >= 5/' src/lines.ts && git_c commit -qam feature &&
    git checkout -q main && sed -i 's/x > 6/x >= 6/' src/lines.ts && git_c commit -qam 'main moves' && git checkout -q feature)
  local pr=$CACHE_ROOT/since-shallow-pr
  rm -rf "$pr"
  git clone -q --depth 1 --branch feature "file://$d" "$pr"
  (cd "$pr" && git fetch -q --depth 1 origin main:refs/remotes/origin/main)
  cp -al "$TEMPLATE_VITEST/node_modules" "$pr/node_modules"
  echo "  EXPECT: an error with the 'git fetch --deepen' hint"
  list_since "$pr" pr-depth1 origin/main
  (cd "$pr" && git fetch -q --deepen 1 origin feature main 2>/dev/null; git fetch -q --deepen 3 origin 2>/dev/null; true)
  echo "  after deepening (both sides reach the branch point). EXPECT: line 5 only"
  list_since "$pr" pr-deepened origin/main
}

unknown_ref() {
  local d
  d=$(since_project unknown-ref)
  list_since "$d" unknown no-such-branch
  echo "  run --json with an unknown ref (is stdout valid JSON?):"
  (cd "$d" && timeout 120 ./node_modules/.bin/mootant run src --since no-such-branch --json >"$DATA_DIR/since-unknown-ref.run.json" 2>"$DATA_DIR/since-unknown-ref.run.json.stderr")
  echo "    exit=$? stdout=$(head -c 200 "$DATA_DIR/since-unknown-ref.run.json") stderr=$(head -c 200 "$DATA_DIR/since-unknown-ref.run.json.stderr")"
}

odd_paths() {
  local d
  d=$(since_project odd-paths)
  for name in 'with space.ts' 'кириллица.ts' 'quote"d.ts' 'back\slash.ts' $'tab\there.ts' '-dash.ts'; do
    write_lines "$d/src/$name"
  done
  commit_all "$d" odd
  (cd "$d" && for f in src/*.ts; do sed -i 's/x > 4/x >= 4/' "$f"; done)
  echo "  EXPECT: line 4 in every file"
  list_since "$d" odd HEAD
}

binary_file() {
  local d
  d=$(since_project binary)
  (cd "$d" && printf 'export const z = (x: number) => x > 9 // \0\n' >>src/lines.ts && git_c commit -qam nul && sed -i 's/x > 2/x >= 2/' src/lines.ts)
  echo "  EXPECT: whole file (git counts it as binary)"
  list_since "$d" nul HEAD
}

tests_only() {
  local d
  d=$(since_project tests-only)
  mkdir -p "$d/test" && echo "import { it } from 'vitest'; it('x', () => {})" >"$d/test/x.test.ts"
  echo "  EXPECT (documented): nothing"
  list_since "$d" tests HEAD
}

detached_and_worktree() {
  local d
  d=$(since_project detached)
  (cd "$d" && sed -i 's/x > 2/x >= 2/' src/lines.ts && git_c commit -qam two && git checkout -q --detach HEAD && sed -i 's/x > 5/x >= 5/' src/lines.ts)
  echo "  EXPECT: lines 2 and 5"
  list_since "$d" detached main
  local wt=$CACHE_ROOT/since-worktree
  rm -rf "$wt"
  (cd "$d" && git worktree add -q "$wt" main 2>/dev/null)
  cp -al "$TEMPLATE_VITEST/node_modules" "$wt/node_modules"
  (cd "$wt" && sed -i 's/x > 6/x >= 6/' src/lines.ts)
  echo "  EXPECT (worktree): line 6"
  list_since "$wt" worktree HEAD
}

merge_conflict() {
  local d
  d=$(since_project conflict)
  (
    cd "$d" &&
      git checkout -q -b feature && sed -i 's/x > 3/x >= 3/' src/lines.ts && git_c commit -qam f &&
      git checkout -q main && sed -i 's/x > 3/x !== 3/' src/lines.ts && git_c commit -qam m &&
      git checkout -q feature && (git_c merge -q main >/dev/null 2>&1 || true) &&
      printf '%s\n' \
        'export const a = (x: number) => x > 1' \
        'export const b = (x: number) => x > 2' \
        'export const c = (x: number) => x >= 3 && x !== 3' \
        'export const d = (x: number) => x > 4' \
        'export const e = (x: number) => x > 5' \
        'export const f = (x: number) => x > 6' >src/lines.ts
  )
  echo "  state: $(cd "$d" && git status --short | tr '\n' ' ')"
  echo "  EXPECT: line 3 (resolved, not yet added)"
  list_since "$d" unmerged main
  (cd "$d" && git add src/lines.ts)
  list_since "$d" resolved main
}

symlinks() {
  local d
  d=$(since_project symlinks)
  (cd "$d" && write_lines src/target.ts && ln -s target.ts src/link.ts && git add -A && git_c commit -qm links)
  (cd "$d" && sed -i 's/x > 5/x >= 5/' src/target.ts)
  echo "  EXPECT: target.ts line 5"
  list_since "$d" target HEAD
  (cd "$d" && git checkout -q src/target.ts && ln -sfn lines.ts src/link.ts && sed -i 's/x > 4/x >= 4/' src/lines.ts)
  echo "  link retargeted to lines.ts, lines.ts line 4 changed. EXPECT: lines.ts line 4 (and maybe the whole of lines.ts through the link)"
  list_since "$d" retarget HEAD
}

user_config() {
  local d
  d=$(since_project user-config)
  (cd "$d" && sed -i 's/x > 2/x >= 2/' src/lines.ts)
  echo "  EXPECT: line 2 under every git configuration"
  for config in diff.noprefix=true diff.mnemonicPrefix=true diff.algorithm=patience color.diff=always diff.relative=true diff.external=false core.quotePath=true; do
    (cd "$d" && git config "${config%%=*}" "${config#*=}")
    list_since "$d" "cfg-${config%%=*}" HEAD
    (cd "$d" && git config --unset "${config%%=*}")
  done
}

submodule() {
  local d
  d=$(since_project submodule)
  local sub=$CACHE_ROOT/since-submodule-lib
  rm -rf "$sub" && mkdir -p "$sub" && write_lines "$sub/lib.ts"
  (cd "$sub" && git init -q -b main && git add -A && git_c commit -qm lib)
  (cd "$d" && git -c protocol.file.allow=always submodule add -q "file://$sub" src/vendor >/dev/null 2>&1 && git_c commit -qm sub)
  (cd "$d/src/vendor" && sed -i 's/x > 2/x >= 2/' lib.ts)
  echo "  EXPECT: ? (submodules are ignored by design)"
  list_since "$d" sub HEAD
}

for scenario in "$@"; do
  echo "=== $scenario ($(date -u +%H:%M:%S))"
  "$scenario"
done
