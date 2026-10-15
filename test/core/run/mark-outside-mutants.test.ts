import { describe, expect, it } from 'vitest'

import { markOutsideMutants } from '../../../core/run/mark-outside-mutants'
import { createTestRun } from '../../helpers/create-test-run'

describe('markOutsideMutants', () => {
  it('gives Error to undecided mutants run outside the workers, per file', async () => {
    let { state } = await createTestRun(
      {
        tests: [
          { file: '/t/a.test.ts', covers: ['a1', 'b1'], id: 't1' },
          { file: '/t/b.test.ts', covers: ['b2'], id: 't2' },
        ],
      },
      { mutants: ['a1', 'a2', 'b1', 'b2'] },
    )
    state.mutants.get('b1')!.verdict = {
      file: '/t/a.test.ts',
      cause: 'assertion',
      status: 'Killed',
      message: 'boom',
      test: 't1',
    }
    let b2 = state.mutants.get('b2')!
    b2.mutant = { ...b2.mutant, file: 'src/b.ts' }
    b2.survived = true

    markOutsideMutants(state, ['a1', 'a2', 'b1', 'b2', 'gone'])

    let message =
      "The test runner ran this mutant's code outside its test workers, such as in a global setup file, where mootant cannot switch mutants."
    expect(state.mutants.get('a1')!.verdict).toStrictEqual({
      status: 'Error',
      cause: null,
      file: null,
      test: null,
      message,
    })
    expect(state.mutants.get('a2')!.verdict).toMatchObject({ status: 'Error' })
    expect(state.mutants.get('b1')!.verdict).toMatchObject({ status: 'Killed' })
    expect(state.mutants.get('b2')!.verdict).toMatchObject({ status: 'Error' })
    expect(state.diagnostics).toStrictEqual([
      {
        message:
          'The test runner ran code of src/a.ts outside its test workers, such as in a global setup file, where mootant cannot switch mutants; 2 mutants that no test killed end with Error.',
        code: 'outside-workers',
        severity: 'warning',
        file: 'src/a.ts',
        column: null,
        line: null,
      },
      {
        message:
          'The test runner ran code of src/b.ts outside its test workers, such as in a global setup file, where mootant cannot switch mutants; 1 mutant that no test killed ends with Error.',
        code: 'outside-workers',
        severity: 'warning',
        file: 'src/b.ts',
        column: null,
        line: null,
      },
    ])
  })
})
