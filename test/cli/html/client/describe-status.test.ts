import { describe, expect, it } from 'vitest'

import { describeStatus } from '../../../../cli/html/client/describe-status'

describe('describeStatus', () => {
  it('names the class, label and rank of a status', () => {
    expect(describeStatus('NoCoverage')).toStrictEqual({
      label: 'no coverage',
      key: 'no-coverage',
      rank: 6,
    })
  })

  it('ranks survivors above every other status', () => {
    let ranks = (
      ['Killed', 'Timeout', 'NoCoverage', 'Error', 'Ignored'] as const
    ).map(status => describeStatus(status).rank)

    expect(Math.max(...ranks)).toBeLessThan(describeStatus('Survived').rank)
  })
})
