import { describe, expect, it } from 'vitest'

import { checkNodeSupport } from '../../../adapters/node-test/check-node-support'

describe('checkNodeSupport', () => {
  it('accepts ^20.19.0 || >=22.12.0', () => {
    expect(
      [
        'v20.19.0',
        'v20.20.1',
        'v22.12.0',
        'v22.23.3',
        'v24.0.0',
        '26.11.1',
      ].map(checkNodeSupport),
    ).toStrictEqual([true, true, true, true, true, true])
    expect(
      ['v20.18.3', 'v21.7.0', 'v22.11.0', 'v18.20.0', 'unknown'].map(
        checkNodeSupport,
      ),
    ).toStrictEqual([false, false, false, false, false])
  })
})
