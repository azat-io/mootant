import { describe, expect, it } from 'vitest'

import { createTestRun } from '../../helpers/create-test-run'
import { getFileCost } from '../../../core/run/get-file-cost'

describe('getFileCost', () => {
  it('adds the loading of a file and the dry durations of all its tests', async () => {
    let { state } = await createTestRun(
      {
        tests: [
          { file: '/t/a.test.ts', covers: ['m1'], duration: 1, id: 'a1' },
          { file: '/t/a.test.ts', duration: 10, id: 'a2' },
        ],
        files: [{ file: '/t/a.test.ts', loadDuration: 4 }],
      },
      { mutants: ['m1'] },
    )

    expect(getFileCost(state, '/t/a.test.ts')).toBe(15)

    state.analysis.loads.delete('/t/a.test.ts')
    state.analysis.fileTests.delete('/t/a.test.ts')

    expect(getFileCost(state, '/t/a.test.ts')).toBe(0)
  })
})
