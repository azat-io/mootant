import { describe, expect, it } from 'vitest'

import { CHANNEL_SLOT } from '../../../../adapters/jest/worker/channel-slot'

describe('cHANNEL_SLOT', () => {
  it('is the registered symbol the two bundles find on fs', () => {
    expect(CHANNEL_SLOT).toBe(Symbol.for('mootant.channel'))
  })
})
