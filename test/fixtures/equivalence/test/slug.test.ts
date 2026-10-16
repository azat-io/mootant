import { expect, it } from 'vitest'

import { isSlug, slug } from '../src/slug'

it('joins words with dashes', () => {
  expect(slug('Hello, World')).toBe('hello-world')
})

it('trims dashes at the ends', () => {
  expect(slug(' a b ')).toBe('a-b')
})

it('tells a slug from other text', () => {
  expect(isSlug('a-b1')).toBe(true)
  expect(isSlug('a--b')).toBe(false)
  expect(isSlug('-a')).toBe(false)
})
