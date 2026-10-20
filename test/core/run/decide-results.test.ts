import { describe, expect, it } from 'vitest'

import { decideResults } from '../../../core/run/decide-results'
import { createTestRun } from '../../helpers/create-test-run'
import { createMutant } from '../../helpers/create-mutant'

describe('decideResults', () => {
  it('turns evidence into statuses in mutant order', async () => {
    let { state } = await createTestRun(
      { tests: [{ file: '/t/a.test.ts', covers: ['m1', 'm2'], id: 'a1' }] },
      { mutants: ['m1', 'm2', 'm3'] },
    )
    let killed = state.mutants.get('m1')!
    killed.verdict = {
      file: '/t/a.test.ts',
      cause: 'assertion',
      status: 'Killed',
      message: 'boom',
      test: 'a1',
    }
    killed.duration = 3
    killed.cached = true
    killed.tries = 2
    state.mutants.get('m2')!.survived = true
    let ignored = createMutant({
      status: 'Ignored',
      start: 0,
      id: 'm4',
      end: 1,
    })

    let results = decideResults(state, [
      ignored,
      killed.mutant,
      state.mutants.get('m2')!.mutant,
      state.mutants.get('m3')!.mutant,
    ])

    expect(results).toStrictEqual([
      {
        isolatedBecause: null,
        status: 'Ignored',
        mutant: ignored,
        killedBy: null,
        killedIn: null,
        coveredBy: [],
        testFiles: [],
        cached: false,
        message: null,
        duration: 0,
        cause: null,
        path: null,
        tries: 0,
      },
      {
        testFiles: ['/t/a.test.ts'],
        killedIn: '/t/a.test.ts',
        isolatedBecause: null,
        mutant: killed.mutant,
        cause: 'assertion',
        coveredBy: ['a1'],
        status: 'Killed',
        message: 'boom',
        killedBy: 'a1',
        path: 'batch',
        cached: true,
        duration: 3,
        tries: 2,
      },
      expect.objectContaining({
        status: 'Survived',
        killedBy: null,
        cached: false,
      }),
      expect.objectContaining({
        testFiles: ['/t/a.test.ts'],
        status: 'NoCoverage',
        coveredBy: [],
        path: null,
      }),
    ])
  })

  it('keeps the files of the covering tests of a mutant no try reached', async () => {
    let { state } = await createTestRun(
      {
        tests: [
          { file: '/t/b.test.ts', covers: ['m1'], id: 'b1' },
          { file: '/test/a.test.ts', covers: ['m2'], id: 'a1' },
        ],
      },
      { mutants: ['m1', 'm2'] },
    )

    let [result] = decideResults(state, [state.mutants.get('m1')!.mutant])

    expect(result).toMatchObject({
      testFiles: ['/t/b.test.ts'],
      status: 'NoCoverage',
      coveredBy: ['b1'],
    })
  })

  it('lists the test files the likeliest first and orders the covering tests by them, then by line', async () => {
    let { state } = await createTestRun(
      {
        tests: [
          { file: '/t/b.test.ts', covers: ['m1'], duration: 0, id: 'b1' },
          { file: '/test/a.test.ts', covers: ['m1'], id: 'a2', line: 9 },
          { file: '/test/a.test.ts', covers: ['m1'], id: 'a3', line: 3 },
          { file: '/test/a.test.ts', covers: ['m1'], id: 'a1' },
          { file: '/t/c.test.ts', id: 'c1' },
        ],
        files: [{ file: '/t/c.test.ts', loadCovers: ['m1'] }],
      },
      { mutants: ['m1'] },
    )
    state.mutants.get('m1')!.survived = true

    let [result] = decideResults(state, [state.mutants.get('m1')!.mutant])

    expect(result).toMatchObject({
      testFiles: ['/test/a.test.ts', '/t/b.test.ts', '/t/c.test.ts'],
      coveredBy: ['a3', 'a2', 'a1', 'b1'],
      status: 'Survived',
    })
  })
})
