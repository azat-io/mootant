import { test, expect } from 'vitest'

import { add, sum } from '../src/math.js'

test('add', () => {
  expect(add(2, 3)).toBe(5)
})

test('sum', () => {
  expect(sum({ scale: 2 }, [1, 2])).toBe(6)
})
