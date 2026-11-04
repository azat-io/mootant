#!/usr/bin/env bash
# --incremental scenarios: r1 (cold) -> change -> r2 (--incremental) ->
# r3 (--no-cache, ground truth). compare_runs prints stale verdicts; the
# diagnostics show whether the "incremental-reuse" warning was printed.
# Usage: s-incremental.sh <scenario>...

source "$(dirname "$0")/lib.sh"

# Source with a module-level object whose property a later top-level statement
# sets: the statement writes no binding, so it is outside the region of
# isAdult (core/generate/get-mutant-regions.ts:52-63).
write_state_source() {
  cat >"$1/src/math.ts" <<'EOF'
export const config = { boundary: 18 }

export function isAdult(age: number): boolean {
  return age >= config.boundary
}

export function add(a: number, b: number): number {
  return a + b
}
EOF
}

# I1: a statement elsewhere in the same file changes the value the mutant
# reads (property write, no binding write).
property_write_elsewhere() {
  local d
  d=$(new_project inc-property-write)
  write_state_source "$d"
  commit_all "$d" state
  run_mootant "$d" r1 src
  printf '\nconfig.boundary = 30\n' >>"$d/src/math.ts"
  run_mootant "$d" r2 src --incremental
  run_mootant "$d" r3 src --no-cache
  compare_runs inc-property-write r2 r3
}

# I2: the test file changes: its key over what it reads outside the mutated
# files changes, so nothing may be reused.
test_change() {
  local d
  d=$(new_project inc-test-change)
  run_mootant "$d" r1 src
  sed -i 's/expect(isAdult(30)).toBe(true)/expect(isAdult(18)).toBe(true)/' "$d/test/math.test.ts"
  run_mootant "$d" r2 src --incremental
  run_mootant "$d" r3 src --no-cache
  compare_runs inc-test-change r2 r3
}

# I3: a dependency outside the mutated paths changes (src/limits.ts is not
# listed, only src/math.ts is).
unlisted_dependency() {
  local d
  d=$(new_project inc-unlisted-dependency)
  echo 'export const BOUNDARY_AGE = 30' >"$d/src/limits.ts"
  cat >"$d/test/math.test.ts" <<'EOF'
import { expect, it } from 'vitest'

import { isAdult, add } from '../src/math'
import { BOUNDARY_AGE } from '../src/limits'

it('isAdult', () => {
  expect(isAdult(BOUNDARY_AGE)).toBe(true)
  expect(isAdult(5)).toBe(false)
})

it('add', () => {
  expect(add(2, 2)).toBe(4)
})
EOF
  commit_all "$d" limits
  run_mootant "$d" r1 src/math.ts
  echo 'export const BOUNDARY_AGE = 18' >"$d/src/limits.ts"
  run_mootant "$d" r2 src/math.ts --incremental
  run_mootant "$d" r3 src/math.ts --no-cache
  compare_runs inc-unlisted-dependency r2 r3
}

# I4: the same, with src/limits.ts among the mutated paths: documented as a
# case where the verdict may go stale; the warning must say so.
listed_dependency() {
  local d
  d=$(new_project inc-listed-dependency)
  echo 'export const BOUNDARY_AGE = 30' >"$d/src/limits.ts"
  cp "$CACHE_ROOT/inc-unlisted-dependency/test/math.test.ts" "$d/test/math.test.ts" 2>/dev/null || {
    echo "  (run unlisted_dependency first)"
    return
  }
  commit_all "$d" limits
  run_mootant "$d" r1 src
  echo 'export const BOUNDARY_AGE = 18' >"$d/src/limits.ts"
  run_mootant "$d" r2 src --incremental
  run_mootant "$d" r3 src --no-cache
  compare_runs inc-listed-dependency r2 r3
}

# I5: a caller in the same file changes (documented heuristic).
caller_change() {
  local d
  d=$(new_project inc-caller-change)
  cat >"$d/src/math.ts" <<'EOF'
export function isAdult(age: number): boolean {
  return age >= 18
}

export function canVote(age: number): boolean {
  return isAdult(age + 0)
}

export function add(a: number, b: number): number {
  return a + b
}
EOF
  cat >"$d/test/math.test.ts" <<'EOF'
import { expect, it } from 'vitest'

import { canVote, add } from '../src/math'

it('canVote', () => {
  expect(canVote(30)).toBe(true)
  expect(canVote(5)).toBe(false)
})

it('add', () => {
  expect(add(2, 2)).toBe(4)
})
EOF
  commit_all "$d" caller
  run_mootant "$d" r1 src
  sed -i 's/return isAdult(age + 0)/return isAdult(age + 12)/' "$d/src/math.ts"
  run_mootant "$d" r2 src --incremental
  run_mootant "$d" r3 src --no-cache
  compare_runs inc-caller-change r2 r3
}

for scenario in "$@"; do
  echo "=== $scenario ($(date -u +%H:%M:%S))"
  "$scenario"
done
