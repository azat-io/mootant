import { expect, it } from 'vitest'

import { lookup } from '../src/lazy'

it('finds one', () => {
  expect(lookup('one')).toBe(1)
})

it('finds two', () => {
  expect(lookup('two')).toBe(2)
})
