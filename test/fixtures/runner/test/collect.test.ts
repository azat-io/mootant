import { afterAll, expect, it } from 'vitest'

import { triple } from '../src/collect'

let results: number[] = []

afterAll(() => {
  expect(results.every(value => value === 3)).toBe(true)
})

it('triples', () => {
  results.push(triple(1))
})
