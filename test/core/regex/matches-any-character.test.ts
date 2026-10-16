import type { AST } from '@eslint-community/regexpp'

import { describe, expect, it } from 'vitest'

import { matchesAnyCharacter } from '../../../core/regex/matches-any-character'
import { parseRegexPattern } from '../../../core/regex/parse-regex-pattern'

/**
 * Parses a pattern of one element.
 *
 * @param pattern - Pattern of one element.
 * @param flags - Flags after the closing slash, such as `s`.
 * @returns The first element of the first alternative.
 */
function parseElement(pattern: string, flags: string): AST.Element {
  return parseRegexPattern(pattern, flags)!.alternatives[0]!.elements[0]!
}

describe('matchesAnyCharacter', () => {
  it.each([
    ['[^]', ''],
    [String.raw`[\s\S]`, ''],
    [String.raw`[\W\w]`, ''],
    [String.raw`[a\d\D]`, ''],
    ['.', 's'],
    [String.raw`[\s\S]`, 'v'],
    [String.raw`[\s\Sa-z]`, 'v'],
  ])('accepts %o with %o', (pattern, flags) => {
    expect(matchesAnyCharacter(parseElement(pattern, flags), flags)).toBe(true)
  })

  it.each([
    ['.', ''],
    ['[^a]', ''],
    [String.raw`[\s\D]`, ''],
    [String.raw`[\p{L}\P{L}]`, 'u'],
    [String.raw`[\s]`, ''],
    ['a', 's'],
    [String.raw`\S`, ''],
    [String.raw`[\s\S\q{}]`, 'v'],
    [String.raw`[\s\S\q{ab}]`, 'v'],
    [String.raw`[\s\S\p{RGI_Emoji}]`, 'v'],
    [String.raw`[\s\S[a]]`, 'v'],
    [String.raw`[\s\S[a--b]]`, 'v'],
  ])('rejects %o with %o', (pattern, flags) => {
    expect(matchesAnyCharacter(parseElement(pattern, flags), flags)).toBe(false)
  })
})
