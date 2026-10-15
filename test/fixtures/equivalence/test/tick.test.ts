import { expect, it } from 'vitest'

import { tick } from '../src/tick'

it('ticks at most three times', { repeats: 2 }, () => {
  expect(tick()).toBeLessThanOrEqual(3)
})
