import { describe, expect, it } from 'vitest'

import type { RunCache } from '../../../types/cache/run-cache'

import { applyCachedUnits } from '../../../core/cache/apply-cached-units'
import { createTestRun } from '../../helpers/create-test-run'

/**
 * Builds a cache that answers lookups from a table.
 *
 * @param answers - Evidence by mutant id and test file key.
 * @returns Cache that only answers lookups.
 */
function createCache(
  answers: Record<string, ReturnType<RunCache['lookupUnit']>>,
): RunCache {
  return {
    lookupUnit: (mutant, file) =>
      answers[`${mutant.mutant.id} ${file}`] ?? null,
    lookupBatch: () => null,
    dependencies: new Map(),
    recordBatch: () => {},
    recordUnit: () => {},
    entries: new Map(),
    pending: new Map(),
    hashes: new Map(),
    inputs: new Map(),
    forget: () => {},
    environment: [],
  }
}

/**
 * World where `m1`, `m2` and `m3` are covered by both test files.
 */
let world = {
  tests: [
    { covers: ['m1', 'm2', 'm3', 'm4'], file: '/t/a.test.ts', id: 'a1' },
    { covers: ['m1', 'm2', 'm3', 'm4'], file: '/t/b.test.ts', id: 'b1' },
  ],
}

describe('applyCachedUnits', () => {
  it('decides from cached kills and passes and keeps the other files', async () => {
    let { state } = await createTestRun(world, {
      mutants: ['m1', 'm2', 'm3', 'm4'],
      isolate: true,
    })
    let kill = {
      cause: 'assertion' as const,
      status: 'Killed' as const,
      file: '/t/b.test.ts',
      message: 'boom',
      test: 'b1',
    }
    state.mutants.get('m4')!.tries = 1
    state.cache = createCache({
      'm2 /t/a.test.ts': 'survived',
      'm2 /t/b.test.ts': 'survived',
      'm3 /t/a.test.ts': 'survived',
      'm4 /t/a.test.ts': 'survived',
      'm4 /t/b.test.ts': 'survived',
      'm1 /t/b.test.ts': kill,
    })

    applyCachedUnits(state)

    expect(state.mutants.get('m1')).toMatchObject({
      verdict: kill,
      cached: true,
      files: [],
    })
    expect(state.mutants.get('m2')).toMatchObject({
      survived: true,
      verdict: null,
      cached: true,
      files: [],
    })
    expect(state.mutants.get('m3')).toMatchObject({
      files: ['/t/b.test.ts'],
      survived: true,
      cached: false,
    })
    expect(state.mutants.get('m4')).toMatchObject({
      survived: true,
      cached: false,
    })
  })

  it('leaves mutants alone without a cache, decided or without files', async () => {
    let { state } = await createTestRun(world, {
      mutants: ['m1', 'm2'],
      isolate: true,
    })
    applyCachedUnits(state)

    expect(state.mutants.get('m1')!.files).toHaveLength(2)

    state.mutants.get('m1')!.verdict = {
      status: 'Error',
      message: null,
      cause: null,
      file: null,
      test: null,
    }
    state.mutants.get('m2')!.files = []
    state.cache = createCache({})
    applyCachedUnits(state)

    expect(state.mutants.get('m1')!.cached).toBe(false)
    expect(state.mutants.get('m2')!.cached).toBe(false)
  })

  it('leaves mutants on the batch path alone', async () => {
    let { state } = await createTestRun(world, { mutants: ['m1'] })
    state.cache = createCache({ 'm1 /t/a.test.ts': 'survived' })

    applyCachedUnits(state)

    expect(state.mutants.get('m1')).toMatchObject({
      survived: false,
      path: 'batch',
    })
  })
})
