import { expect, it } from 'vitest'

import { double, settle } from '../src/settle'

it('settles quickly', async () => {
  expect(await settle(3, true)).toBe(3)
})

it('doubles one', () => {
  expect(double(1)).toBe(2)
})

it('doubles two', () => {
  expect(double(2)).toBe(4)
})

it('doubles three', () => {
  expect(double(3)).toBe(6)
})

it('doubles four', () => {
  expect(double(4)).toBe(8)
})

it('doubles five', () => {
  expect(double(5)).toBe(10)
})
