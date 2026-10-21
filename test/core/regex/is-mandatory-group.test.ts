import { describe, expect, it } from 'vitest'

import { parseRegexPattern } from '../../../core/regex/parse-regex-pattern'
import { isMandatoryGroup } from '../../../core/regex/is-mandatory-group'

describe('isMandatoryGroup', () => {
  it.each([
    '(?<a>x)',
    '^(?<a>[^:]+):',
    '(?<a>)',
    '(?<a>x|y)z',
    '(?:(?<a>x))',
    '((?<a>x))',
    '(?<b>(?<a>x))',
    '(?<a>x)+',
    '(?:y(?<a>x)){1,3}',
    '(?:(?:(?<a>x))+)+?',
    '(?<b>x)?(?<a>y)',
    '(?i:(?<a>x))',
  ])('finds the group a in every match of %s', pattern => {
    expect(isMandatoryGroup(parseRegexPattern(pattern, 'u')!, 'a')).toBe(true)
  })

  it.each([
    '(?<a>x)?',
    '(?<a>x)*',
    '(?<a>x){0,2}',
    '(?:x(?<a>y))?z',
    '(?<a>x)|y',
    '(?:(?<a>x)|y)z',
    '((?<a>x)|y)z',
    '(?<b>(?<a>x)|y)z',
    '(?<a>x)|(?<a>y)',
    '(?=(?<a>x))x',
    '(?!(?<a>x))y',
    '(?<=(?<a>x))y',
    '(?<b>x)',
    '(x)',
    '[a]',
  ])('does not find the group a in every match of %s', pattern => {
    expect(isMandatoryGroup(parseRegexPattern(pattern, 'u')!, 'a')).toBe(false)
  })
})
