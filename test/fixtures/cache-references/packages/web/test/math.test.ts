import { expect, it } from 'vitest'

import { Child, double } from '../src/math'

it('child', () => {
  expect([5, 10]).toContain(new Child().value)
  expect(double(0)).toBe(0)
})
