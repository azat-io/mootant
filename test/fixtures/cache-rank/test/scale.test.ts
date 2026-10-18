import { expect, it } from 'vitest'

import { scale } from '../src/scale'

it('scales', () => {
  expect(typeof scale(1)).toBe('number')
})
