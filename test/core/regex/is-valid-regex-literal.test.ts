import { describe, expect, it } from 'vitest'

import { isValidRegexLiteral } from '../../../core/regex/is-valid-regex-literal'

describe('isValidRegexLiteral', () => {
  it.each([
    ['a', ''],
    ['', ''],
    [String.raw`\/`, ''],
    ['[/]', ''],
    [String.raw`[\]/]`, ''],
    [String.raw`[[\/]]`, 'v'],
    [String.raw`\p{L}`, 'u'],
  ])('accepts %s with %o', (pattern, flags) => {
    expect(isValidRegexLiteral(pattern, flags)).toBe(true)
  })

  it.each([
    ['a/b', ''],
    ['[a]/', ''],
    ['[[a]/]', 'v'],
    ['a\nb', ''],
    ['a\u{2028}', ''],
    ['(', ''],
    [String.raw`\p{Foo}`, 'u'],
    ['a', 'gg'],
  ])('rejects %o with %o', (pattern, flags) => {
    expect(isValidRegexLiteral(pattern, flags)).toBe(false)
  })
})
