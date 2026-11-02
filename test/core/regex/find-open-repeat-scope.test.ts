import type { AST } from '@eslint-community/regexpp'

import { describe, expect, it } from 'vitest'

import { findOpenRepeatScope } from '../../../core/regex/find-open-repeat-scope'
import { parseRegexPattern } from '../../../core/regex/parse-regex-pattern'
import { loadRegexpp } from '../../../core/regex/load-regexpp'

/**
 * Every string of up to five characters of an alphabet that tells these
 * patterns apart.
 */
const TEXTS = listTexts(['a', 'b', '1', '%'], 5)

/**
 * Upper bounds tried for a quantifier at its lower bound and above it.
 */
const EXTRA_REPEATS = [0, 1, 2, Infinity]

/**
 * Writes a pattern with other upper bounds of its quantifier.
 *
 * @param pattern - Pattern of a regular expression.
 * @param node - Quantifier of the pattern.
 * @returns The patterns with every upper bound tried.
 */
function changeUpperBound(pattern: string, node: AST.Quantifier): string[] {
  return EXTRA_REPEATS.map(extra => {
    let upper = extra === Infinity ? '' : node.min + extra
    let quantifier = `{${node.min},${upper}}${node.greedy ? '' : '?'}`
    return `${pattern.slice(0, node.element.end)}${quantifier}${pattern.slice(node.end)}`
  })
}

/**
 * Lists every string of up to some length over an alphabet.
 *
 * @param alphabet - Characters of the strings.
 * @param length - Greatest length.
 * @returns The strings, shortest first.
 */
function listTexts(alphabet: string[], length: number): string[] {
  let texts = ['']
  let last = ['']
  for (let step = 0; step < length; step++) {
    last = last.flatMap(text => alphabet.map(letter => `${text}${letter}`))
    texts.push(...last)
  }
  return texts
}

/**
 * Finds the quantifiers of a pattern.
 *
 * @param pattern - Pattern of a regular expression.
 * @returns Its quantifiers in pattern order, outer first.
 */
function findQuantifiers(pattern: string): AST.Quantifier[] {
  let quantifiers: AST.Quantifier[] = []
  loadRegexpp().visitRegExpAST(parseRegexPattern(pattern, '')!, {
    onQuantifierEnter(node) {
      quantifiers.push(node)
    },
  })
  return quantifiers
}

/**
 * Describes what a pattern matches on the texts.
 *
 * @param pattern - Pattern of a regular expression.
 * @returns The place and the text of each first match, text by text.
 */
function matchTexts(pattern: string): (string | null)[] {
  let regex = new RegExp(pattern)
  return TEXTS.map(text => {
    let match = regex.exec(text)
    return match && `${match.index}:${match[0]}`
  })
}

/**
 * Tells on which texts a pattern matches.
 *
 * @param pattern - Pattern of a regular expression.
 * @returns Whether it matches, text by text.
 */
function testTexts(pattern: string): boolean[] {
  let regex = new RegExp(pattern)
  return TEXTS.map(text => regex.test(text))
}

describe('findOpenRepeatScope', () => {
  describe('in a pattern', () => {
    it.each([
      // Nothing before it.
      String.raw`\d+(?=%)`,
      String.raw`\d+%`,
      String.raw`\d{2,3}%`,
      String.raw`\d{2}%`,
      'a*b',
      'a+?b',
      String.raw`\d+$`,
      String.raw`\d+\b`,
      // Nothing after it.
      String.raw`%\d+`,
      String.raw`^\d+`,
      String.raw`\b\d+`,
      String.raw`(?<=%)\d+`,
      'ba{2,3}',
      // Both.
      String.raw`\d+`,
      'a{1,}',
      // Only optional elements after it.
      String.raw`%\d+a?`,
      String.raw`%\d+a*b{0,2}`,
      // Through groups and other alternatives.
      String.raw`(\d+)%`,
      String.raw`(?:\d+)%`,
      String.raw`(?:\d+|x)%`,
      String.raw`(?:x|\d+)%`,
      String.raw`%(\d+)`,
      String.raw`%(?:x|(\d+))`,
      String.raw`^a|\d+%`,
      String.raw`a$|%\d+`,
    ])('does not change whether %s matches', pattern => {
      let node = findQuantifiers(pattern).find(
        quantifier => findOpenRepeatScope(quantifier)?.type === 'Pattern',
      )
      let original = testTexts(pattern)

      expect(node).toBeDefined()

      for (let changed of changeUpperBound(pattern, node!)) {
        expect(testTexts(changed)).toStrictEqual(original)
      }
    })

    it.each([
      String.raw`-?\d+%`,
      String.raw`a?\d+%`,
      String.raw`b*\d+%`,
      String.raw`(?:^b)?\d+%`,
      String.raw`(?:(?=a)b)?\d+%`,
      String.raw`(?:b?(\d+)a)%`,
    ])(
      'does not count the optional part before the last one in %s',
      pattern => {
        let node = findQuantifiers(pattern).at(-1)
        let original = testTexts(pattern)

        expect(findOpenRepeatScope(node!)?.type).toBe('Pattern')

        for (let changed of changeUpperBound(pattern, node!)) {
          expect(testTexts(changed)).toStrictEqual(original)
        }
      },
    )

    it.each([
      // Something required on both sides.
      String.raw`^\d+$`,
      String.raw`a\d+%`,
      String.raw`^\d+%`,
      String.raw`a\d+$`,
      String.raw`\b\d+\b`,
      String.raw`(?<=a)\d+(?=%)`,
      String.raw`a(\d+)%`,
      String.raw`a(?:\d+|b)%`,
      String.raw`ab?\d+%`,
      String.raw`(?:a\d+)%`,
      String.raw`^(?:\d+a)`,
      String.raw`^(?:\d+)%`,
    ])('sees that the upper bound of %s matters', pattern => {
      let node = findQuantifiers(pattern).at(-1)
      let original = testTexts(pattern).join(',')

      expect(findOpenRepeatScope(node!)).toBeNull()
      expect(
        changeUpperBound(pattern, node!).some(
          changed => testTexts(changed).join(',') !== original,
        ),
      ).toBe(true)
    })

    it('stops at another quantifier', () => {
      let [outer, inner] = findQuantifiers(String.raw`(?:\d+a)+%`)

      expect(findOpenRepeatScope(outer!)?.type).toBe('Pattern')
      expect(findOpenRepeatScope(inner!)).toBeNull()
    })
  })

  describe('in a lookaround', () => {
    it.each([
      // The end of a lookahead.
      String.raw`b(?=\d+)`,
      String.raw`b(?!\d+)`,
      String.raw`b(?=a\d+)`,
      String.raw`b(?=a\d+%?)`,
      String.raw`b(?=(?:x|\d+))`,
      String.raw`b(?=a(?:\d+))%?`,
      // The start of a lookbehind, which matches backward.
      String.raw`(?<=\d+)b`,
      String.raw`(?<!\d+)b`,
      String.raw`(?<=\d+a)b`,
      String.raw`(?<=(?:x|\d+)a)b`,
      // Under another quantifier, since the lookaround starts at one place.
      String.raw`(?:b(?=\d+))+`,
    ])('does not change what %s matches', pattern => {
      let node = findQuantifiers(pattern).find(
        quantifier => findOpenRepeatScope(quantifier)?.type === 'Assertion',
      )
      let original = matchTexts(pattern)

      expect(node).toBeDefined()

      for (let changed of changeUpperBound(pattern, node!)) {
        expect(matchTexts(changed)).toStrictEqual(original)
      }
    })

    it('does not count the optional part at the far end of a lookbehind', () => {
      let pattern = String.raw`(?<=%?\d+a)b`
      let node = findQuantifiers(pattern).at(-1)
      let original = matchTexts(pattern)

      expect(findOpenRepeatScope(node!)?.type).toBe('Assertion')

      for (let changed of changeUpperBound(pattern, node!)) {
        expect(matchTexts(changed)).toStrictEqual(original)
      }
    })

    it.each([
      // Something required beyond it.
      String.raw`b(?=\d+%)`,
      String.raw`b(?!\d+%)`,
      String.raw`(?<=a\d+)b`,
      String.raw`(?<!a\d+)b`,
    ])('sees that the upper bound of %s matters', pattern => {
      let [node] = findQuantifiers(pattern)
      let original = matchTexts(pattern).join(',')

      expect(findOpenRepeatScope(node!)).toBeNull()
      expect(
        changeUpperBound(pattern, node!).some(
          changed => matchTexts(changed).join(',') !== original,
        ),
      ).toBe(true)
    })

    it('stops at the lookaround, not at the pattern around it', () => {
      let [node] = findQuantifiers(String.raw`(?=\d+%)`)

      expect(findOpenRepeatScope(node!)).toBeNull()
    })

    it('stops at a quantifier inside the lookaround', () => {
      let [outer, inner] = findQuantifiers(String.raw`b(?=(?:a\d+){2})`)

      expect(findOpenRepeatScope(outer!)?.type).toBe('Assertion')
      expect(findOpenRepeatScope(inner!)).toBeNull()
    })
  })
})
