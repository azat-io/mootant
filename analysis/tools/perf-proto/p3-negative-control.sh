#!/usr/bin/env bash
# Negative control of P3 (MOOTANT_REUSE_DRY_RUN): shows that the hash of the
# whole project tree in the snapshot is necessary. A test file outside the dry
# run (its helper does not import src) starts to cover src through a changed
# helper; no file any dry test file depended on changed. The snapshot's `tree`
# is then forged to the new tree hash, as if the snapshot had no tree check:
# the replay must give stale verdicts, which the normal warm run does not.
# Usage: p3-negative-control.sh <vitest-units project with the P3 build> <results-dir>
set -uo pipefail
PROJECT=${1:?project directory}
OUT=${2:?results directory}
HERE=$(cd "$(dirname "$0")" && pwd)
RUN=$HERE/run-mootant.sh
COMPARE=$HERE/../compare-verdicts.mjs
CACHE=$PROJECT/node_modules/.cache/mootant
mkdir -p "$OUT"
cd "$PROJECT" || exit 2
git checkout -q -- . && git clean -q -fdx -e node_modules
rm -rf "$CACHE"
export MOOTANT_REUSE_DRY_RUN=1
mkdir -p test/helpers
printf "export function word() { return 'hi' }\n" >test/helpers/other.js
printf "import { expect, test } from 'vitest'\nimport { word } from './helpers/other.js'\ntest('other', () => { expect(word()).toBe('hi') })\n" >test/other.test.js
"$RUN" "$PROJECT" "$OUT/n1-cold" src --concurrency 2
"$RUN" "$PROJECT" "$OUT/n2-unchanged" src --concurrency 2
grep -q 'Reused the dry run' "$OUT/n2-unchanged.err" && echo "n2: replayed (expected)"
# The helper now reaches src and kills survivors of capitalize and joinList.
printf "import { capitalize, joinList } from '../../src/text.js'\nexport function word() { return capitalize('') === '' && joinList(['a', 'b']) === 'a and b' && capitalize('b') === 'B' ? 'hi' : 'no' }\n" >test/helpers/other.js
rm -rf "$OUT/state" && cp -a "$CACHE" "$OUT/state"
node --input-type=module -e "
import { readFileSync, writeFileSync } from 'node:fs'
import { hashProjectTree } from '$PROJECT/node_modules/mootant/dist/core/cache/hash-project-tree.js'
let file = '$CACHE/dry-v1.json'
let snapshot = JSON.parse(readFileSync(file, 'utf8'))
snapshot.tree = await hashProjectTree('$PROJECT')
writeFileSync(file, JSON.stringify(snapshot))
console.log('forged the tree hash of the snapshot')
"
"$RUN" "$PROJECT" "$OUT/n3-forged-A" src --concurrency 2
grep -q 'Reused the dry run' "$OUT/n3-forged-A.err" && echo "n3: replayed the forged snapshot"
rm -rf "$CACHE" && cp -a "$OUT/state" "$CACHE"
unset MOOTANT_REUSE_DRY_RUN
"$RUN" "$PROJECT" "$OUT/n3-normal-B" src --concurrency 2
node "$COMPARE" "$OUT/n3-normal-B.json" "$OUT/n3-forged-A.json" --label normal,forged | tee "$OUT/compare.md"
git checkout -q -- . && git clean -q -fdx -e node_modules
