import { expect, test } from 'vitest'

import { increment, reset } from '../src/counter.js'

test('a fresh counter starts at one', () => {
  reset()
  expect(increment()).toBe(1)
})
