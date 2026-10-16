import { describe, expect, it } from 'vitest'

import { hasCasedCharacter } from '../../../core/regex/has-cased-character'
import { parseRegexPattern } from '../../../core/regex/parse-regex-pattern'

/**
 * Tells whether a pattern has a cased character.
 *
 * @param pattern - Pattern of a literal.
 * @param flags - Flags of the literal.
 * @returns What hasCasedCharacter answers.
 */
function check(pattern: string, flags = ''): boolean {
  return hasCasedCharacter(parseRegexPattern(pattern, flags)!, flags)
}

describe('hasCasedCharacter', () => {
  it.each([
    ['a', ''],
    ['A', ''],
    ['ß', ''],
    [String.raw`\x41`, ''],
    ['[0-a]', ''],
    ['[!-~]', ''],
    [String.raw`[\u00C0-\u00FF]`, ''],
    ['[0-9A]', ''],
    [String.raw`\p{Lu}`, 'u'],
    [String.raw`\w`, 'u'],
    [String.raw`\W`, 'v'],
    [String.raw`\b`, 'u'],
    [String.raw`(1)\1`, ''],
  ])('accepts %o with %o', (pattern, flags) => {
    expect(check(pattern, flags)).toBe(true)
  })

  it.each([
    ['1', ''],
    [String.raw`\d`, ''],
    [String.raw`\w`, ''],
    [String.raw`\b`, ''],
    ['[0-9]', ''],
    ['[!-@]', ''],
    ['[[-`]', ''],
    ['.', 'u'],
    ['^$', 'u'],
  ])('rejects %o with %o', (pattern, flags) => {
    expect(check(pattern, flags)).toBe(false)
  })
})
