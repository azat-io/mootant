import { expect, test } from 'vitest'

import { lookup, register, size } from '../src/registry.js'

// The second test relies on the first one: a test file whose tests share
// state, as many real ones do. The first test never calls lookup.
test('registers an entry', () => {
  register('a', 1)
  expect(size()).toBe(1)
})

test('looks the entry up', () => {
  expect(lookup('a')).toBe(1)
})

test('misses an unknown entry', () => {
  expect(lookup('zzz')).toBeNull()
})
