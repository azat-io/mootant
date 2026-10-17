import { expect, it } from 'vitest'

import { greet } from '../src/greet'

it('greets', () => {
  expect(greet('ann')).toBe(
    process.env.MOOTANT_LOUD === '1' ? 'ANN!' : 'hello ann',
  )
})
