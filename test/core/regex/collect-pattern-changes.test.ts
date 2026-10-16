import { describe, expect, it } from 'vitest'

import type { RegexPatternOptions } from '../../../types/mutator/regex-pattern-options'

import { collectPatternChanges } from '../../../core/regex/collect-pattern-changes'
import { parseRegexPattern } from '../../../core/regex/parse-regex-pattern'

/**
 * Options of the mutator in `recommended`.
 */
const DEFAULTS: RegexPatternOptions = {
  largeAlternations: false,
  classMembers: false,
  quantifiers: false,
  negations: false,
}

/**
 * Lists the changed patterns of a pattern.
 *
 * @param pattern - Pattern of a literal.
 * @param flags - Flags of the literal.
 * @param options - Options over the defaults.
 * @returns Each changed pattern, with the rule of its skip if any.
 */
function collect(
  pattern: string,
  flags = '',
  options: Partial<RegexPatternOptions> = {},
): string[] {
  return collectPatternChanges(parseRegexPattern(pattern, flags)!, flags, {
    ...DEFAULTS,
    ...options,
  }).map(
    change =>
      `${pattern.slice(0, change.start)}${change.text}${pattern.slice(change.end)}${change.skip ? ` (${change.skip.rule})` : ''}`,
  )
}

describe('collectPatternChanges', () => {
  it('removes a quantified lookahead with its quantifier', () => {
    expect(collect('(?=a)?b')).toStrictEqual(['b', '(?=a)b'])
  })

  it('orders changes by start, the outer change first', () => {
    expect(collect('(?:a|b)c?')).toStrictEqual([
      '(?:b)c?',
      '(?:a)c?',
      '(?:a|b)c',
    ])
  })

  it('keeps the skip of a removal with a capturing group', () => {
    expect(collect('(?<=(a))b|c')).toStrictEqual([
      'c (regex-capturing-group)',
      'b|c (regex-capturing-group)',
      '(?<=(a))b',
    ])
  })

  it('leaves `.` and a property of strings alone', () => {
    expect(
      collect(String.raw`.\p{RGI_Emoji}`, 'v', { negations: true }),
    ).toStrictEqual(['.[^]'])
  })

  it('escapes the characters of a narrowed range', () => {
    expect(collect('[ -~]', '', { classMembers: true })).toStrictEqual([
      '[^]',
      String.raw`[\u0021-~]`,
      String.raw`[ -\u007D]`,
    ])
  })

  it('narrows a lazy quantifier and keeps it lazy', () => {
    expect(collect('a+?', '', { quantifiers: true })).toStrictEqual([
      'a',
      'a*?',
      'a{2,}?',
    ])
  })

  it('widens only the outer class of a nested expression class', () => {
    expect(collect(String.raw`[[\w--\d]x]`, 'v')).toStrictEqual(['[^]'])
  })

  it('widens a class of any character that also holds strings', () => {
    expect(collect(String.raw`[\s\S\q{}]`, 'v')).toStrictEqual(['[^]'])
    expect(collect(String.raw`[\s\S]`, 'v')).toStrictEqual([
      '[^] (any-character)',
    ])
  })
})
