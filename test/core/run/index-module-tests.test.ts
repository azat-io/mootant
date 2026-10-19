import { describe, expect, it } from 'vitest'

import { indexModuleTests } from '../../../core/run/index-module-tests'
import { createTestRun } from '../../helpers/create-test-run'
import { createMutant } from '../../helpers/create-mutant'

describe('indexModuleTests', () => {
  it('lists the tests that reached any mutant of each module in all or one of their tries', async () => {
    let { state } = await createTestRun(
      {
        tests: [
          { file: '/t/a.test.ts', covers: ['m1'], id: 'a1' },
          { file: '/t/a.test.ts', firstOnly: ['m2'], id: 'a2' },
          { file: '/t/b.test.ts', covers: ['m3'], id: 'b1' },
          { file: '/t/b.test.ts', id: 'b2' },
        ],
      },
      { mutants: ['m1', 'm2', 'm3', 'm4'] },
    )

    let index = indexModuleTests(
      [
        createMutant({ file: 'a.ts', start: 0, id: 'm1', end: 1 }),
        createMutant({ file: 'a.ts', start: 0, id: 'm2', end: 1 }),
        createMutant({ file: 'b.ts', start: 0, id: 'm3', end: 1 }),
        createMutant({ file: 'c.ts', start: 0, id: 'm4', end: 1 }),
      ],
      state.analysis,
    )

    expect(index).toStrictEqual(
      new Map([
        ['a.ts', new Set(['a1', 'a2'])],
        ['b.ts', new Set(['b1'])],
        ['c.ts', new Set()],
      ]),
    )
  })
})
