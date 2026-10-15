import { describe, expect, it } from 'vitest'

import { createTestRun } from '../../helpers/create-test-run'
import { sortTests } from '../../../core/run/sort-tests'

describe('sortTests', () => {
  it('sorts by dry duration, then by id', async () => {
    let { state } = await createTestRun(
      {
        tests: [
          { file: '/t/a.test.ts', duration: 5, id: 'slow' },
          { file: '/t/a.test.ts', duration: 1, id: 'b' },
          { file: '/t/a.test.ts', duration: 1, id: 'a' },
        ],
      },
      { mutants: [] },
    )

    expect(sortTests(['slow', 'b', 'a'], state.analysis)).toStrictEqual([
      'a',
      'b',
      'slow',
    ])
  })
})
