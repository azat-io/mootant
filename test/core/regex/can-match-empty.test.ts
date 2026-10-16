import { describe, expect, it } from 'vitest'

import { parseRegexPattern } from '../../../core/regex/parse-regex-pattern'
import { canMatchEmpty } from '../../../core/regex/can-match-empty'

describe('canMatchEmpty', () => {
  it.each([
    ['', ''],
    ['a*', ''],
    ['a?b?', ''],
    ['a{0,2}', ''],
    ['(?:a+)*', ''],
    ['a|', ''],
    ['(a|)', ''],
    ['^$', ''],
    [String.raw`\b`, ''],
    ['(?=a)', ''],
    [String.raw`(a?)\1`, ''],
    [String.raw`[\q{}a]`, 'v'],
    ['(?:)+', ''],
    [String.raw`[\q{ab|}--\q{z}]$`, 'v'],
    [String.raw`[\q{ab|}--[a]]`, 'v'],
    [String.raw`[[\q{}]&&[\q{|a}]]`, 'v'],
    [String.raw`[[\q{}]&&[\q{|a}]&&[\q{b|}]]`, 'v'],
    [String.raw`[[\q{}--a]]`, 'v'],
    ['(?i:a|)', ''],
  ])('accepts %o', (pattern, flags) => {
    expect(canMatchEmpty(parseRegexPattern(pattern, flags)!)).toBe(true)
  })

  it.each([
    ['a', ''],
    ['a+', ''],
    ['a|b', ''],
    ['(a)', ''],
    ['[a]', ''],
    ['[^a]', ''],
    ['.', ''],
    [String.raw`\d`, ''],
    ['a{1,2}', ''],
    [String.raw`[\q{ab}]`, 'v'],
    [String.raw`[^\q{a}]`, 'v'],
    [String.raw`[\w--\d]`, 'v'],
    [String.raw`[\q{ab|}--\q{z|}]`, 'v'],
    [String.raw`[\q{|a}&&\q{a}]`, 'v'],
    [String.raw`[\q{|a}&&[\q{|b}]&&a]`, 'v'],
    [String.raw`[^\w--\d]`, 'v'],
    [String.raw`[[\q{}--\q{}]]`, 'v'],
    ['(?i:a)', ''],
  ])('rejects %o', (pattern, flags) => {
    expect(canMatchEmpty(parseRegexPattern(pattern, flags)!)).toBe(false)
  })
})
