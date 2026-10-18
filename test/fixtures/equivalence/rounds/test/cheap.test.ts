import { expect, it } from 'vitest'

import { scale } from '../src/scale'

it('returns a number', () => {
  expect(typeof scale(1)).toBe('number')
})
