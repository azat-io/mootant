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
        cached: false,
        message: null,
        duration: 0,
        cause: null,
        path: null,
        tries: 0,
      },
      {
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
      expect.objectContaining({ status: 'NoCoverage', path: null }),
    ])
  })
})
