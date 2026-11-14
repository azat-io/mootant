import { expect, it } from 'vitest'

import { fib } from '../src/fib'

it('computes the 25th number', () => {
  expect(fib(25)).toBe(75025)
})
