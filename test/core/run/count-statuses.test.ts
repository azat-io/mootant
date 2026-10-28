import { describe, expect, it } from 'vitest'

import { countStatuses } from '../../../core/run/count-statuses'

describe('countStatuses', () => {
  it('counts every status, zero included', () => {
    expect(
      countStatuses([
        { status: 'Killed' },
        { status: 'Survived' },
        { status: 'Killed' },
      ]),
    ).toStrictEqual({
      NoCoverage: 0,
      Survived: 1,
      Ignored: 0,
      Timeout: 0,
      Killed: 2,
      Error: 0,
    })
  })
})
