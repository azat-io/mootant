import { describe, expect, it } from 'vitest'

import { parseRegexPattern } from '../../../core/regex/parse-regex-pattern'

describe('parseRegexPattern', () => {
  it('parses a pattern with offsets relative to it', () => {
    expect(parseRegexPattern('a|b', '')).toMatchObject({
      alternatives: [
        { start: 0, end: 1 },
        { start: 2, end: 3 },
      ],
      type: 'Pattern',
    })
  })

  it.each([
    [String.raw`\p{L}`, 'u'],
    [String.raw`[\w--\d]`, 'v'],
  ])('parses %s in the mode of %s', (pattern, flags) => {
    expect(parseRegexPattern(pattern, flags)).not.toBeNull()
    expect(parseRegexPattern(pattern, '')).toMatchObject({ type: 'Pattern' })
  })

  it.each([
    ['(', ''],
    [String.raw`[\w--\d]`, 'u'],
  ])('returns null for %s with %o', (pattern, flags) => {
    expect(parseRegexPattern(pattern, flags)).toBeNull()
  })
})
