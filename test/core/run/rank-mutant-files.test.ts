import { describe, expect, it } from 'vitest'

import { rankMutantFiles } from '../../../core/run/rank-mutant-files'
import { createTestRun } from '../../helpers/create-test-run'

describe('rankMutantFiles', () => {
  it('lists files named after the module first, then by cost and key, with files that reached it while loading', async () => {
    let { state } = await createTestRun(
      {
        tests: [
          { file: '/t/c.test.ts', covers: ['m1'], duration: 1, id: 'c1' },
          { file: '/t/b.test.ts', covers: ['m1'], duration: 1, id: 'b1' },
          { file: '/t/d.test.ts', covers: ['m1'], duration: 0, id: 'd1' },
          { file: '/test/a.test.ts', covers: ['m1'], duration: 9, id: 'a1' },
          { file: '/t/e.test.ts', id: 'e1' },
        ],
        files: [{ file: '/t/e.test.ts', loadCovers: ['m1'], loadDuration: 5 }],
      },
      { mutants: ['m1'] },
    )

    expect(rankMutantFiles(state, state.mutants.get('m1')!)).toStrictEqual([
      '/test/a.test.ts',
      '/t/d.test.ts',
      '/t/b.test.ts',
      '/t/c.test.ts',
      '/t/e.test.ts',
    ])
  })
})
