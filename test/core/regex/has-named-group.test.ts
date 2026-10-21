import { describe, expect, it } from 'vitest'

import { parseRegexPattern } from '../../../core/regex/parse-regex-pattern'
import { hasNamedGroup } from '../../../core/regex/has-named-group'

describe('hasNamedGroup', () => {
  it.each([
    ['(?<a>x)', 'u'],
    ['(?:x(?<tail>y))?z', 'u'],
    ['(x)|(?<a>y)', ''],
    ['(?=(?<a>x))', 'u'],
    ['(?<!(?<a>x))y', 'u'],
    ['[a](?<a>)', 'v'],
  ])('finds a named group in %s', (pattern, flags) => {
    expect(hasNamedGroup(parseRegexPattern(pattern, flags)!)).toBe(true)
  })

  it.each([
    ['x', ''],
    ['(x)', ''],
    ['(?:x)', ''],
    ['(?=x)', ''],
    [String.raw`\k<a>`, ''],
    [String.raw`\(?<a>x\)`, ''],
  ])('finds no named group in %s', (pattern, flags) => {
    expect(hasNamedGroup(parseRegexPattern(pattern, flags)!)).toBe(false)
  })
})
