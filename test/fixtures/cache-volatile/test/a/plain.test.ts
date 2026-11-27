import { expect, it } from 'vitest'

import { isAdult } from '../../src/plain'

it('tells adults', () => {
  expect(isAdult(30)).toBe(true)
  expect(isAdult(5)).toBe(false)
})
