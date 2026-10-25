import { describe, expect, it } from 'vitest'

import type { MutantVerdict } from '../../../types/run/mutant-state'
import type { RunCache } from '../../../types/cache/run-cache'

import { applyCachedBatch } from '../../../core/cache/apply-cached-batch'
import { createTestRun } from '../../helpers/create-test-run'

/**
 * Builds a cache that answers lookups from tables.
 *
 * @param units - Isolated evidence by mutant id and test file key.
 * @param batch - Batch evidence by mutant id and test id.
 * @returns Cache that only answers lookups.
 */
function createCache(
  units: Record<string, ReturnType<RunCache['lookupUnit']>>,
  batch: Record<string, ReturnType<RunCache['lookupBatch']>> = {},
): RunCache {
  return {
    lookupBatch: (mutant, test) => batch[`${mutant.mutant.id} ${test}`] ?? null,
    lookupUnit: (mutant, file) => units[`${mutant.mutant.id} ${file}`] ?? null,
    dependencies: new Map(),
    recordBatch: () => {},
    recordUnit: () => {},
    regional: new Set(),
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
  it('prefers isolated evidence decided like fresh units, then batch kills', async () => {
    let { state } = await createTestRun(
      {
        tests: [
          {
            covers: ['m1', 'm2', 'm3', 'm4', 'm5', 'm6'],
            file: '/t/a.test.ts',
            id: 'a1',
          },
          {
            covers: ['m1', 'm2', 'm3', 'm4', 'm5', 'm6'],
            file: '/t/b.test.ts',
            id: 'b1',
          },
        ],
      },
      { mutants: ['m1', 'm2', 'm3', 'm4', 'm5', 'm6'] },
    )
    state.cache = createCache(
      {
        'm1 /t/b.test.ts': createKill('b1'),
        'm6 /t/b.test.ts': createKill('b1'),
        'm6 /t/a.test.ts': 'survived',
        'm2 /t/a.test.ts': 'survived',
        'm2 /t/b.test.ts': 'survived',
        'm3 /t/a.test.ts': 'survived',
        'm4 /t/a.test.ts': 'survived',
      },
      {
        'm1 a1': createKill('a1'),
        'm3 b1': createKill('b1'),
        'm4 b1': createKill('b1'),
        'm3 a1': 'survived',
      },
    )

    applyCachedBatch(state)

    expect(state.mutants.get('m1')).toMatchObject({
      verdict: createKill('a1'),
      path: 'batch',
      cached: true,
      queue: [],
    })
    expect(state.mutants.get('m6')).toMatchObject({
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
      verdict: null,
      cached: false,
      path: 'batch',
    })
    expect(state.mutants.get('m5')!.cached).toBe(false)
  })

  it('reuses a batch kill only after cached passes of the tests tried before it', async () => {
    let { state } = await createTestRun(
      {
        tests: [
          { covers: ['m1', 'm2', 'm3'], file: '/t/c.test.ts', id: 'c1' },
          { covers: ['m1', 'm2', 'm3'], file: '/t/b.test.ts', id: 'b1' },
          { covers: ['m1', 'm2', 'm3'], file: '/t/a.test.ts', id: 'a1' },
          { covers: ['m1', 'm2', 'm3'], file: '/t/a.test.ts', id: 'a2' },
        ],
      },
      { mutants: ['m1', 'm2', 'm3'] },
    )
    for (let mutant of state.mutants.values()) {
      mutant.coveredBy = ['c1', 'a2', 'b1', 'a1']
    }
    state.cache = createCache(
      {},
      {
        'm1 b1': createKill('b1'),
        'm2 a2': createKill('a2'),
        'm1 a1': 'survived',
        'm1 a2': 'survived',
        'm1 c1': 'survived',
        'm2 c1': 'survived',
        'm3 a1': 'survived',
        'm3 a2': 'survived',
        'm3 b1': 'survived',
        'm3 c1': 'survived',
      },
    )

    applyCachedBatch(state)

    expect(state.mutants.get('m1')).toMatchObject({
      verdict: createKill('b1'),
      cached: true,
    })
    expect(state.mutants.get('m2')).toMatchObject({
      verdict: null,
      cached: false,
    })
    expect(state.mutants.get('m3')).toMatchObject({
      verdict: null,
      cached: false,
    })
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
