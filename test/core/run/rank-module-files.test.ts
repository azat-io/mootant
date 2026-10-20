import { describe, expect, it } from 'vitest'

import { rankModuleFiles } from '../../../core/run/rank-module-files'
import { createTestRun } from '../../helpers/create-test-run'

describe('rankModuleFiles', () => {
  it('lists the test files named after the module or importing it, then those that reach it, by the tests that reach it and by key', async () => {
    let { state } = await createTestRun(
      {
        tests: [
          { file: '/t/c.test.ts', covers: ['m2'], id: 'c1' },
          { file: '/t/d.test.ts', covers: ['m2'], id: 'd1' },
          { file: '/t/d.test.ts', covers: ['m3'], id: 'd2' },
          { file: '/t/b.test.ts', covers: ['m3'], id: 'b1' },
          { file: '/test/a.test.ts', id: 'a1' },
          { file: '/t/e.test.ts', id: 'e1' },
          { file: '/t/f.test.ts', id: 'f1' },
          { file: '/t/g.test.ts', id: 'g1' },
          { file: '/lib/a.test.ts', id: 'h1' },
        ],
      },
      { mutants: ['m1', 'm2', 'm3'] },
    )
    state.imports = new Map([
      ['/t/f.test.ts', ['/src/a.ts']],
      ['/t/e.test.ts', ['/src/a']],
    ])

    expect(rankModuleFiles(state, 'src/a.ts')).toStrictEqual([
      '/test/a.test.ts',
      '/t/e.test.ts',
      '/t/f.test.ts',
      '/t/d.test.ts',
      '/t/b.test.ts',
      '/t/c.test.ts',
    ])
  })

  it('lists nothing for a module no test file is related to', async () => {
    let { state } = await createTestRun(
      { tests: [{ file: '/t/b.test.ts', covers: ['m1'], id: 'b1' }] },
      { mutants: ['m1'] },
    )

    expect(rankModuleFiles(state, 'src/c.ts')).toStrictEqual([])
  })
})
