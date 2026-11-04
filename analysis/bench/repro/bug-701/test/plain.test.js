import { expect, test } from 'vitest'

import { add } from '../src/add.js'

test('adds zero', () => {
  expect(add(0, 3)).toBe(3)
})
