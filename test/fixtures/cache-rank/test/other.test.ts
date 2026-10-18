import { expect, it } from 'vitest'

import { scale } from '../src/scale'

it('doubles', () => {
  let end = Date.now() + 80
  while (Date.now() < end) {
    // Costs more than `scales`, so fast mode tries `scales` first.
  }
  expect(scale(2)).toBe(4)
})
