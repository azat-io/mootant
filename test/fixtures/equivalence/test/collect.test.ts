import { afterAll, expect, it } from 'vitest'

import { triple } from '../src/collect'

let results: number[] = []

afterAll(() => {
  expect(results).toStrictEqual([3, 6])
})

it('triples one', () => {
  results.push(triple(1))
})

it('triples two', () => {
  results.push(triple(2))
})
