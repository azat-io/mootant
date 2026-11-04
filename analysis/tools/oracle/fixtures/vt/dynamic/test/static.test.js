import { expect, test } from 'vitest'

import { add } from '../src/math.js'

test('add of zeros', () => {
  expect(add(0, 0)).toBe(0)
})
