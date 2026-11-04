import { expect, it } from 'vitest'

import { isKeyword } from '../src/keywords.js'

it('accepts a keyword', () => {
  expect(isKeyword('if')).toBe(true)
})

it('rejects an empty word', () => {
  expect(isKeyword('')).toBe(false)
})

it('rejects an identifier', () => {
  expect(isKeyword('foo')).toBe(false)
})
