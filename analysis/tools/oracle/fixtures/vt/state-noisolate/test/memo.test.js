import { expect, test } from 'vitest'

import { fib } from '../src/memo.js'

test('fib', () => {
  expect(fib(25)).toBe(75025)
})
