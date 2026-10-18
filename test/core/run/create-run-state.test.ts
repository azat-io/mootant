import { describe, expect, it } from 'vitest'

import { createTestRun, TEST_LIMITS } from '../../helpers/create-test-run'
import { createRunState } from '../../../core/run/create-run-state'
import { createMutant } from '../../helpers/create-mutant'

describe('createRunState', () => {
  it('routes mutants and gives the mutants of failed files an error', async () => {
    let { state: base } = await createTestRun(
      {
        tests: [
          { file: '/t/a.test.ts', covers: ['m1', 'm2'], duration: 2, id: 'a1' },
          { file: '/t/a.test.ts', covers: ['m1'], duration: 1, id: 'a2' },
          { file: '/t/a.test.ts', firstOnly: ['m3'], id: 'a3' },
        ],
      },
      { mutants: ['m1', 'm2', 'm3', 'm4'] },
    )
    let state = createRunState({
      mutants: [
        createMutant({ start: 0, id: 'm1', end: 1 }),
        createMutant({ start: 0, id: 'm3', end: 1 }),
        createMutant({ file: 'b.ts', start: 0, id: 'm4', end: 1 }),
        createMutant({ file: 'c.ts', start: 0, id: 'm5', end: 1 }),
      ],
      errors: new Map([['b.ts', 'Broken.']]),
      analysis: base.analysis,
      limits: TEST_LIMITS,
      imports: new Map(),
      report: () => {},
      root: '/root',
      batch: true,
      fast: true,
      workers: 3,
    })

    expect(state).toMatchObject({ diagnostics: [], workers: 3, runs: {} })
    expect(state.mutants.get('m1')).toMatchObject({
      coveredBy: ['a2', 'a1'],
      queue: ['a2', 'a1'],
      path: 'batch',
      verdict: null,
    })
    expect(state.mutants.get('m1')!.queue).not.toBe(
      state.mutants.get('m1')!.coveredBy,
    )
    expect(state.mutants.get('m3')).toMatchObject({
      isolatedBecause: 'first-reach',
      files: ['/t/a.test.ts'],
      path: 'isolated',
    })
    expect(state.mutants.get('m4')).toMatchObject({
      verdict: { message: 'Broken.', status: 'Error' },
      path: null,
    })
    expect(state.mutants.get('m5')).toMatchObject({
      coveredBy: [],
      verdict: null,
      path: null,
    })
  })
})
