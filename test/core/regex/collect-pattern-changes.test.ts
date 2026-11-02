import { describe, expect, it } from 'vitest'

import type { RegexPatternOptions } from '../../../types/mutator/regex-pattern-options'
import type { SkipNote } from '../../../types/mutant/skip-note'

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
 * Skip of a change at an open edge of a pattern that code only tests.
 */
const TESTED: SkipNote = { rule: 'unused-repeat', reason: 'tested' }

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
  return collectPatternChanges(
    { tree: parseRegexPattern(pattern, flags)!, flags },
    { ...DEFAULTS, ...options },
    null,
  ).map(
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

  describe('with an upper bound that does not change a match', () => {
    /**
     * Lists the changed patterns with the quantifiers option, for code that
     * only tests the pattern or not.
     *
     * @param pattern - Pattern of a literal.
     * @param testedSkip - Skip of a change where code only tests, or null.
     * @param flags - Flags of the literal.
     * @returns Each changed pattern with `tested` for that skip or the rule of
     *   another skip, if any.
     */
    function collectBounds(
      pattern: string,
      testedSkip: SkipNote | null,
      flags = '',
    ): string[] {
      return collectPatternChanges(
        { tree: parseRegexPattern(pattern, flags)!, flags },
        { ...DEFAULTS, quantifiers: true },
        testedSkip,
      ).map(change => {
        let text = `${pattern.slice(0, change.start)}${change.text}${pattern.slice(change.end)}`
        if (change.skip === null) {
          return text
        }
        return `${text} (${change.skip === testedSkip ? 'tested' : change.skip.rule})`
      })
    }

    it('skips only the changes of the upper bound at an open edge', () => {
      expect(collectBounds('a+%', TESTED)).toStrictEqual([
        'a% (tested)',
        'a*%',
        'a{2,}%',
      ])
      expect(collectBounds('a{2,4}%', TESTED)).toStrictEqual([
        'a{2}% (tested)',
        'a{1,4}%',
        'a{3,4}%',
        'a{2,3}% (tested)',
        'a{2,5}% (tested)',
      ])
      expect(collectBounds('a{2}', TESTED)).toStrictEqual([
        'a{1,2}',
        'a{3}',
        'a{2,3} (tested)',
      ])
      expect(collectBounds('a*%', TESTED)).toStrictEqual([
        'a+%',
        'a?% (tested)',
      ])
    })

    it('lists a skipped change once where two bounds print the same', () => {
      expect(collectBounds('a{2,3}%', TESTED)).toStrictEqual([
        'a{2}% (tested)',
        'a{1,3}%',
        'a{3}%',
        'a{2,4}% (tested)',
      ])
      expect(collectBounds('a{0,2}%', TESTED)).toStrictEqual([
        'a{1,2}%',
        'a?% (tested)',
        'a{0,3}% (tested)',
      ])
    })

    it('keeps both of them where the change is not skipped', () => {
      expect(collectBounds('%a{2,3}%', TESTED)).toStrictEqual([
        '%a{2}%',
        '%a{1,3}%',
        '%a{3}%',
        '%a{2}%',
        '%a{2,4}%',
      ])
    })

    it('keeps them without a skip for an open edge of the pattern', () => {
      expect(collectBounds('a+%', null)).toStrictEqual(['a%', 'a*%', 'a{2,}%'])
    })

    it('keeps them where something required stands on both sides', () => {
      expect(collectBounds('%a+%', TESTED)).toStrictEqual([
        '%a%',
        '%a*%',
        '%a{2,}%',
      ])
    })

    it('keeps them in a pattern with a backreference', () => {
      expect(collectBounds(String.raw`(a+)\1`, TESTED)).toStrictEqual([
        String.raw`(a)\1`,
        String.raw`(a*)\1`,
        String.raw`(a{2,})\1`,
      ])
      expect(collectBounds(String.raw`b(?=a+)(c)\1`, null)).toStrictEqual([
        String.raw`b(c)\1`,
        String.raw`b(?=a)(c)\1`,
        String.raw`b(?=a*)(c)\1`,
        String.raw`b(?=a{2,})(c)\1`,
      ])
    })

    it.each([
      [String.raw`\0+1`, 'u'],
      [String.raw`\x+41`, ''],
      [String.raw`\u+0041`, ''],
      [String.raw`\c+A?`, ''],
      [String.raw`x(?=\0+1?)`, ''],
      [String.raw`(?<=\x+41)x`, ''],
    ])(
      'leaves %s, whose narrowed form merges tokens or fails, to later checks',
      (pattern, flags) => {
        expect(collectBounds(pattern, TESTED, flags)).not.toContainEqual(
          expect.stringMatching(/\((?:tested|unused-repeat)\)$/u),
        )
      },
    )

    it('lists once a skippable change that merges tokens', () => {
      expect(
        collectBounds(String.raw`\0{1,2}1`, TESTED).filter(
          line => line === String.raw`\01`,
        ),
      ).toHaveLength(1)
    })

    it('skips them at the far end of a lookaround, tested or not', () => {
      for (let skip of [TESTED, null]) {
        expect(collectBounds('b(?=a+)', skip)).toStrictEqual([
          'b',
          'b(?=a) (unused-repeat)',
          'b(?=a*)',
          'b(?=a{2,})',
        ])
      }
    })

    it('keeps them in a lookaround with a capturing group, unless tested', () => {
      expect(collectBounds('b(?=(a+))', null)).toStrictEqual([
        'b (regex-capturing-group)',
        'b(?=(a))',
        'b(?=(a*))',
        'b(?=(a{2,}))',
      ])
      expect(collectBounds('b(?=c(d)a+)', null)).toStrictEqual([
        'b (regex-capturing-group)',
        'b(?=c(d)a)',
        'b(?=c(d)a*)',
        'b(?=c(d)a{2,})',
      ])
      expect(collectBounds('b(?=(a+))', TESTED)).toStrictEqual([
        'b (regex-capturing-group)',
        'b(?=(a)) (tested)',
        'b(?=(a*))',
        'b(?=(a{2,}))',
      ])
    })

    it('makes no skip without the quantifiers option', () => {
      expect(
        collectPatternChanges(
          { tree: parseRegexPattern('a*', '')!, flags: '' },
          DEFAULTS,
          TESTED,
        ),
      ).toStrictEqual([{ skip: null, text: '+', start: 1, end: 2 }])
    })

    it.each([
      'a{100000000000000000000000}',
      'a{1,100000000000000000000000}',
      'a{100000000000000000000000,}',
    ])('moves no bound of %s, too large to print exactly', pattern => {
      expect(
        collectBounds(pattern, TESTED).filter(line => line.includes('e+')),
      ).toStrictEqual([])
      expect(
        collectBounds(pattern, TESTED).filter(line => line.includes('tested')),
      ).toStrictEqual([])
    })
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
