#!/bin/bash
# Creates fixtures whose mutants hang or misbehave, for Vitest and node:test.
# The mutant of interest is the number-literal `size - 9` -> `size - 10` in
# src/step.js, which makes the step 0; the test evaluates getStep(10) once, so the hit limit does not see
# the endless loop that follows in the test file.
set -euo pipefail
T=/home/user/mootant/analysis/tools/cli
P=/home/user/projects/cli

write_src() {
  mkdir -p "$1/src" "$1/test"
  cat > "$1/src/step.js" <<'JS'
export function getStep(size) {
  return size - 9
}
JS
}

# --- sync endless loop in the test body
for kind in vitest node-test; do
  short=$([ $kind = vitest ] && echo vt || echo nt)
  D=$($T/make-fixture.sh $short-hang $kind); write_src $D
  if [ $kind = vitest ]; then IMP="import { expect, it } from 'vitest'"; EXP="expect(n).toBe(10)"; else IMP="import { it } from 'node:test'
import assert from 'node:assert/strict'"; EXP="assert.equal(n, 10)"; fi
  cat > $D/test/step.test.js <<JS
$IMP

import { getStep } from '../src/step.js'

it('counts to ten', () => {
  let step = getStep(10)
  let n = 0
  for (let i = 0; i < 10; i += step) {
    n++
  }
  $EXP
})
JS
done

# --- async endless loop on microtasks only (timers never fire)
for kind in vitest node-test; do
  short=$([ $kind = vitest ] && echo vt || echo nt)
  D=$($T/make-fixture.sh $short-hang-micro $kind); write_src $D
  if [ $kind = vitest ]; then IMP="import { expect, it } from 'vitest'"; EXP="expect(n).toBe(10)"; else IMP="import { it } from 'node:test'
import assert from 'node:assert/strict'"; EXP="assert.equal(n, 10)"; fi
  cat > $D/test/step.test.js <<JS
$IMP

import { getStep } from '../src/step.js'

it('counts to ten asynchronously', async () => {
  let step = getStep(10)
  let n = 0
  for (let i = 0; i < 10; i += step) {
    await Promise.resolve()
    n++
  }
  $EXP
})
JS
done

# --- endless loop in afterAll / after
for kind in vitest node-test; do
  short=$([ $kind = vitest ] && echo vt || echo nt)
  D=$($T/make-fixture.sh $short-hang-after $kind); write_src $D
  if [ $kind = vitest ]; then IMP="import { afterAll, expect, it } from 'vitest'"; HOOK=afterAll; EXP="expect(getStep(10)).toBeGreaterThan(-5)"; else IMP="import { after, it } from 'node:test'
import assert from 'node:assert/strict'"; HOOK=after; EXP="assert.ok(getStep(10) > -5)"; fi
  cat > $D/test/step.test.js <<JS
$IMP

import { getStep } from '../src/step.js'

$HOOK(() => {
  let step = getStep(10)
  for (let i = 0; i < 10; i += step) {}
})

it('has a step', () => {
  $EXP
})
JS
done

# --- a mutant that makes the test start a long-lived detached process
for kind in vitest node-test; do
  short=$([ $kind = vitest ] && echo vt || echo nt)
  D=$($T/make-fixture.sh $short-child $kind)
  mkdir -p $D/src $D/test
  cat > $D/src/flag.js <<'JS'
export function shouldStart() {
  return false
}
JS
  if [ $kind = vitest ]; then IMP="import { expect, it } from 'vitest'"; EXP="expect(shouldStart()).toBe(false)"; else IMP="import { it } from 'node:test'
import assert from 'node:assert/strict'"; EXP="assert.equal(shouldStart(), false)"; fi
  cat > $D/test/flag.test.js <<JS
$IMP
import { spawn } from 'node:child_process'

import { shouldStart } from '../src/flag.js'

it('starts nothing by default', () => {
  if (shouldStart()) {
    // a detached server and an attached one, both long-lived
    spawn('sleep', ['417'], { detached: true, stdio: 'ignore' }).unref()
    spawn('sleep', ['418'], { stdio: 'ignore' }).unref()
  }
  $EXP
})
JS
done

# --- memory: a mutant that grows an array forever
for kind in vitest node-test; do
  short=$([ $kind = vitest ] && echo vt || echo nt)
  D=$($T/make-fixture.sh $short-mem $kind); write_src $D
  if [ $kind = vitest ]; then IMP="import { expect, it } from 'vitest'"; EXP="expect(items.length).toBe(10)"; else IMP="import { it } from 'node:test'
import assert from 'node:assert/strict'"; EXP="assert.equal(items.length, 10)"; fi
  cat > $D/test/step.test.js <<JS
$IMP

import { getStep } from '../src/step.js'

it('collects ten items', () => {
  let step = getStep(10)
  let items = []
  for (let i = 0; i < 10; i += step) {
    items.push('x'.repeat(1024 * 64))
  }
  $EXP
})
JS
done
ls -d $P/*-hang* $P/*-child $P/*-mem
