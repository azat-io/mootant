import { describe, expect, it } from 'vitest'

import type { MutantVerdict } from '../../../types/run/mutant-state'
import type { RunCache } from '../../../types/cache/run-cache'

import { applyCachedBatch } from '../../../core/cache/apply-cached-batch'
import { createTestRun } from '../../helpers/create-test-run'

/**
 * Builds a cache that answers lookups from tables.
 *
 * @param units - Isolated evidence by mutant id and test file key.
 * @param batch - Batch kills by mutant id and test id.
 * @returns Cache that only answers lookups.
 */
function createCache(
  units: Record<string, ReturnType<RunCache['lookupUnit']>>,
  batch: Record<string, MutantVerdict> = {},
): RunCache {
  return {
    lookupBatch: (mutant, test) => batch[`${mutant.mutant.id} ${test}`] ?? null,
    lookupUnit: (mutant, file) => units[`${mutant.mutant.id} ${file}`] ?? null,
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
 * Builds a kill by a test.
 *
 * @param test - Id of the test.
 * @returns Assertion failure in the test's file.
 */
function createKill(test: string): MutantVerdict {
  return {
    file: `/t/${test[0]}.test.ts`,
    cause: 'assertion',
    status: 'Killed',
    message: 'boom',
    test,
  }
}

describe('applyCachedBatch', () => {
  it('prefers isolated evidence, then batch kills', async () => {
    let { state } = await createTestRun(
      {
        tests: [
          {
            covers: ['m1', 'm2', 'm3', 'm4', 'm5'],
            file: '/t/a.test.ts',
            id: 'a1',
          },
          {
            covers: ['m1', 'm2', 'm3', 'm4', 'm5'],
            file: '/t/b.test.ts',
            id: 'b1',
          },
        ],
      },
      { mutants: ['m1', 'm2', 'm3', 'm4', 'm5'] },
    )
    state.cache = createCache(
      {
        'm1 /t/b.test.ts': createKill('b1'),
        'm2 /t/a.test.ts': 'survived',
        'm2 /t/b.test.ts': 'survived',
        'm3 /t/a.test.ts': 'survived',
        'm4 /t/a.test.ts': 'survived',
      },
      {
        'm1 a1': createKill('a1'),
        'm3 b1': createKill('b1'),
      },
    )

    applyCachedBatch(state)

    expect(state.mutants.get('m1')).toMatchObject({
      verdict: createKill('b1'),
      path: 'isolated',
      cached: true,
      queue: [],
    })
    expect(state.mutants.get('m2')).toMatchObject({
      path: 'isolated',
      survived: true,
      verdict: null,
      cached: true,
      queue: [],
    })
    expect(state.mutants.get('m3')).toMatchObject({
      verdict: createKill('b1'),
      survived: false,
      path: 'batch',
      cached: true,
      queue: [],
    })
    expect(state.mutants.get('m4')).toMatchObject({
      queue: ['a1', 'b1'],
      survived: false,
      cached: false,
      path: 'batch',
    })
    expect(state.mutants.get('m5')!.cached).toBe(false)
  })

  it('leaves mutants alone without a cache or off the batch path', async () => {
    let { state } = await createTestRun(
      {
        tests: [{ covers: ['m1', 'm2'], file: '/t/a.test.ts', id: 'a1' }],
        files: [{ file: '/t/a.test.ts', loadCovers: ['m2'] }],
      },
      { mutants: ['m1', 'm2'] },
    )
    applyCachedBatch(state)

    expect(state.mutants.get('m1')!.cached).toBe(false)

    state.mutants.get('m1')!.verdict = createKill('a1')
    state.cache = createCache({ 'm2 /t/a.test.ts': 'survived' })
    applyCachedBatch(state)

    expect(state.mutants.get('m1')!.cached).toBe(false)
    expect(state.mutants.get('m2')).toMatchObject({
      path: 'isolated',
      survived: false,
    })
  })
})
