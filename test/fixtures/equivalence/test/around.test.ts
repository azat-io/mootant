import { aroundEach, expect, it } from 'vitest'

import { double } from '../src/around'

let result = 0

aroundEach(async runTest => {
  await runTest()
  expect(result).toBe(4)
})

it('doubles', () => {
  result = double(2)
})
