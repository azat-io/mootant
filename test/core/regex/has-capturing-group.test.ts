import { describe, expect, it } from 'vitest'

import { hasCapturingGroup } from '../../../core/regex/has-capturing-group'
import { parseRegexPattern } from '../../../core/regex/parse-regex-pattern'

describe('hasCapturingGroup', () => {
  it.each(['(a)', '(?<name>a)', '(?:(a))', '(?=(a))', 'b|(a)'])(
    'finds the group in %s',
    pattern => {
      expect(hasCapturingGroup(parseRegexPattern(pattern, '')!)).toBe(true)
    },
  )

  it.each(['a', '(?:a)', '(?=a)', String.raw`\(a\)`, '[(]'])(
    'finds no group in %s',
    pattern => {
      expect(hasCapturingGroup(parseRegexPattern(pattern, '')!)).toBe(false)
    },
  )
})
