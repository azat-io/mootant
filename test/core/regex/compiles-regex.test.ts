import { describe, expect, it } from 'vitest'

import { compilesRegex } from '../../../core/regex/compiles-regex'

describe('compilesRegex', () => {
  it.each([
    ['a/b', ''],
    ['', 'g'],
    [String.raw`\p{L}`, 'u'],
  ])('accepts %o with %o', (pattern, flags) => {
    expect(compilesRegex(pattern, flags)).toBe(true)
  })

  it.each([
    ['(', ''],
    ['a', 'gg'],
    [String.raw`\p{Foo}`, 'u'],
  ])('rejects %o with %o', (pattern, flags) => {
    expect(compilesRegex(pattern, flags)).toBe(false)
  })
})
