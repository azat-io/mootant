#!/usr/bin/env bash
# Equivalence check of P3 (reuse of the dry run, MOOTANT_REUSE_DRY_RUN=1) on a
# fixture of analysis/experiments/perf-fixtures with the P3 build installed
# (setup-fixture.sh + use-mootant.sh). For every scenario it runs, from the same
# cache state:
#   A  mootant run with MOOTANT_REUSE_DRY_RUN=1 (may skip the test runner),
#   B  the same run without it (the normal warm run of the same build),
# and compares their verdicts (compare-verdicts.mjs --strict). The scenario
# then continues from the state A left. A must equal B in every scenario; A must
# say "Reused the dry run" only where nothing changed.
# Usage: check-dry-snapshot.sh <project-dir> <results-dir> [vitest|node]
set -uo pipefail
PROJECT=${1:?project directory}
OUT=${2:?results directory}
RUNNER=${3:-vitest}
HERE=$(cd "$(dirname "$0")" && pwd)
RUN=$HERE/run-mootant.sh
COMPARE=$HERE/../compare-verdicts.mjs
CACHE=$PROJECT/node_modules/.cache/mootant
mkdir -p "$OUT"
cd "$PROJECT" || exit 2
git checkout -q -- . && git clean -q -fdx -e node_modules
rm -rf "$CACHE"
summary=$OUT/summary.txt
: >"$summary"

snapshot_state() { rm -rf "$OUT/state"; cp -a "$CACHE" "$OUT/state"; }
restore_state() { rm -rf "$CACHE"; cp -a "$OUT/state" "$CACHE"; }

# scenario <name> [mootant run args...]: runs A and B from the current state.
scenario() {
  local name=$1
  shift
  snapshot_state
  MOOTANT_REUSE_DRY_RUN=1 "$RUN" "$PROJECT" "$OUT/$name-A" "$@" >/dev/null
  rm -rf "$OUT/after-A"
  cp -a "$CACHE" "$OUT/after-A"
  restore_state
  "$RUN" "$PROJECT" "$OUT/$name-B" "$@" >/dev/null
  rm -rf "$CACHE"
  cp -a "$OUT/after-A" "$CACHE"
  local reused=no
  grep -q 'Reused the dry run' "$OUT/$name-A.err" && reused=yes
  local runs
  runs=$(node -p "JSON.stringify(require('$OUT/$name-A.json').summary.runs)")
  local verdict
  verdict=$(node "$COMPARE" "$OUT/$name-B.json" "$OUT/$name-A.json" --strict --label B,A | sed -n 3p)
  local note
  note=$(grep -E 'dry run (cannot|was not)|Saved the dry run|No saved dry run' "$OUT/$name-A.err" | tr '\n' ' ' | sed 's/  */ /g')
  printf '%-22s reused=%-3s runs(A)=%-24s %s\n    A: %s\n    A wall %s | B wall %s\n' \
    "$name" "$reused" "$runs" "$verdict" "$note" \
    "$(cut -d' ' -f1 "$OUT/$name-A.time")" "$(cut -d' ' -f1 "$OUT/$name-B.time")" | tee -a "$summary"
}

ARGS=(src --concurrency 2)
# S0: cold run with the cache; A saves the snapshot.
scenario s0-cold "${ARGS[@]}"
# S1: nothing changed: A replays without the test runner.
scenario s1-unchanged "${ARGS[@]}"
if [ "$RUNNER" = vitest ]; then
  # S2: a test file of the dry run gets an assertion that kills a survivor.
  sed -i "s/expect(joinList(\['a', 'b'\])).toContain('a')/expect(joinList(['a', 'b'])).toBe('a and b')/" test/text.test.js
  scenario s2-edit-test "${ARGS[@]}"
  scenario s2b-unchanged "${ARGS[@]}"
  # S3: a new test file kills a survivor.
  printf "import { expect, test } from 'vitest'\nimport { pad } from '../src/text.js'\ntest('pads to width', () => { expect(pad(7, 3)).toBe('  7') })\n" >test/new.test.js
  scenario s3-new-test "${ARGS[@]}"
  # S4: a test file outside the dry run (its helper does not import src)...
  mkdir -p test/helpers
  printf "export function word() { return 'hi' }\n" >test/helpers/other.js
  printf "import { expect, test } from 'vitest'\nimport { word } from './helpers/other.js'\ntest('other', () => { expect(word()).toBeTruthy() })\n" >test/other.test.js
  scenario s4a-unrelated-test "${ARGS[@]}"
  scenario s4b-unchanged "${ARGS[@]}"
  # ...then its helper starts to import src and the test kills a survivor.
  printf "import { capitalize } from '../../src/text.js'\nexport function word() { return capitalize('') === '' ? 'hi' : '' }\n" >test/helpers/other.js
  scenario s4c-helper-imports-src "${ARGS[@]}"
  # S5: a test reads an environment variable; then the variable changes.
  printf "import { expect, test } from 'vitest'\nimport { countWords } from '../src/text.js'\ntest('env', () => { expect(countWords(process.env.FIXTURE_WORDS ?? 'a b')).toBeGreaterThan(0) })\n" >test/env.test.js
  export FIXTURE_WORDS='one two'
  scenario s5a-env-test "${ARGS[@]}"
  scenario s5b-unchanged "${ARGS[@]}"
  export FIXTURE_WORDS='three'
  scenario s5c-env-changed "${ARGS[@]}"
  # S6: a Vitest configuration appears, then changes.
  printf "export default { test: { testTimeout: 5000 } }\n" >vitest.config.js
  scenario s6a-config-added "${ARGS[@]}"
  printf "export default { test: { testTimeout: 6000 } }\n" >vitest.config.js
  scenario s6b-config-changed "${ARGS[@]}"
  # S7: a mutated source changes.
  sed -i 's/return value \* 3/return value * 4/' src/math.js
  scenario s7-source-changed "${ARGS[@]}"
  # S8: one mutant only (--mutant), nothing changed since S7.
  id=$(node -p "require('$OUT/s7-source-changed-A.json').mutants.find(m => m.status === 'Survived').id")
  scenario s8-one-mutant src --concurrency 2 --mutant "$id"
  scenario s8b-all-again "${ARGS[@]}"
else
  sed -i "s/assert.ok(joinList(\['a', 'b'\]).includes('a'))/assert.equal(joinList(['a', 'b']), 'a and b')/" test/text.test.js
  scenario s2-edit-test "${ARGS[@]}"
  scenario s2b-unchanged "${ARGS[@]}"
  printf "import { test } from 'node:test'\nimport assert from 'node:assert/strict'\nimport { pad } from '../src/text.js'\ntest('pads to width', () => { assert.equal(pad(7, 3), '  7') })\n" >test/new.test.js
  scenario s3-new-test "${ARGS[@]}"
  export NODE_OPTIONS=--no-warnings
  scenario s5-node-options "${ARGS[@]}"
  unset NODE_OPTIONS
fi
git checkout -q -- . && git clean -q -fdx -e node_modules
echo "summary: $summary"
