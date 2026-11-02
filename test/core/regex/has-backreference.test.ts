import { describe, expect, it } from 'vitest'

import { parseRegexPattern } from '../../../core/regex/parse-regex-pattern'
import { hasBackreference } from '../../../core/regex/has-backreference'

describe('hasBackreference', () => {
  it.each([
    String.raw`(a)\1`,
    String.raw`(?<name>a)\k<name>`,
    String.raw`\1(a)`,
    String.raw`(a)(?=\1)`,
    String.raw`(?:(a)|b\1)+`,
  ])('finds the backreference in %s', pattern => {
    expect(hasBackreference(parseRegexPattern(pattern, '')!)).toBe(true)
  })

  it.each([
    'a',
    '(a)',
    String.raw`\1`,
    String.raw`(a)\\1`,
    String.raw`(a)[\1]`,
  ])('finds no backreference in %s', pattern => {
    expect(hasBackreference(parseRegexPattern(pattern, '')!)).toBe(false)
  })
})
