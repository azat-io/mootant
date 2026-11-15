import { describe, expect, it } from 'vitest'

import { getTestFileLimits } from '../../../core/run/get-test-file-limits'
import { createTestRun } from '../../helpers/create-test-run'

describe('getTestFileLimits', () => {
  it('adds up the limits of loading a test file and of each of its tests', async () => {
    let { state } = await createTestRun(
      {
        tests: [
          { file: '/t/a.test.ts', duration: 2, id: 'a1' },
          { file: '/t/a.test.ts', covers: ['m1'], id: 'a2' },
          { file: '/t/b.test.ts', id: 'b1' },
        ],
        files: [{ file: '/t/a.test.ts', loadDuration: 10, loadCovers: [] }],
      },
      { mutants: ['m1'] },
    )

    expect(getTestFileLimits(state, '/t/a.test.ts', 1)).toStrictEqual({
      timeout: 280 + 256 + 253,
      hitLimit: 300_000,
    })
    expect(getTestFileLimits(state, '/t/a.test.ts', 2)).toStrictEqual({
      timeout: 2 * (280 + 256 + 253),
      hitLimit: 300_000,
    })
  })

  it('counts a file the dry run did not load or saw no tests of as empty', async () => {
    let { state } = await createTestRun(
      { tests: [{ file: '/t/a.test.ts', covers: ['m1'], id: 'a1' }] },
      { mutants: ['m1'] },
    )
    state.analysis.loads.clear()
    state.analysis.fileTests.clear()

    expect(getTestFileLimits(state, '/t/a.test.ts', 1)).toStrictEqual({
      hitLimit: 100_000,
      timeout: 250,
    })
  })
})
