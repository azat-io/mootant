import { expect, it } from 'vitest'
import limits from 'limits-pkg'

import { isAdult } from '../src/math'

it('tells adults', () => {
  expect(isAdult(limits.age)).toBe(true)
  expect(isAdult(5)).toBe(false)
})
