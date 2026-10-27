import { describe, expect, it } from 'vitest'

import { countStatuses } from '../../../../cli/html/client/count-statuses'
import { getScore } from '../../../../cli/html/client/get-score'

describe('getScore', () => {
  it('scores detected mutants over scored ones, rounded to two decimals', () => {
    expect(
      getScore(
        countStatuses([
          { status: 'Killed' },
          { status: 'Timeout' },
          { status: 'Survived' },
          { status: 'Error' },
          { status: 'Ignored' },
        ]),
      ),
    ).toBe(66.67)
  })

  it('counts mutants without coverage as undetected', () => {
    expect(
      getScore(countStatuses([{ status: 'Killed' }, { status: 'NoCoverage' }])),
    ).toBe(50)
  })

  it('has no score without mutants to score', () => {
    expect(getScore(countStatuses([{ status: 'Ignored' }]))).toBeNull()
  })
})
