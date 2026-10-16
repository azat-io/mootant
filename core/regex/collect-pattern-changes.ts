import type { AST } from '@eslint-community/regexpp'

import type { RegexPatternOptions } from '../../types/mutator/regex-pattern-options'
import type { RegexChange } from '../../types/regex/regex-change'
import type { SkipNote } from '../../types/mutant/skip-note'

import { matchesAnyCharacter } from './matches-any-character'
import { hasCapturingGroup } from './has-capturing-group'
import { isEdgeWildcard } from './is-edge-wildcard'
import { loadRegexpp } from './load-regexpp'

/**
 * Most alternatives of one list whose removals are emitted without the
 * `largeAlternations` option.
 */
const MAX_ALTERNATIVES = 8

/**
 * Class that matches any character.
 */
const ANY_CHARACTER = '[^]'

/**
 * Characters printed as they are inside a class; others are escaped.
 */
const PLAIN_CHARACTER_PATTERN = /^[\dA-Za-z]$/u

/**
 * Skip of a removal that would renumber capturing groups.
 */
const CAPTURING_GROUP_SKIP: SkipNote = {
  reason:
    'it removes a capturing group, which renumbers the groups after it and changes their references',
  rule: 'regex-capturing-group',
}

/**
 * Lists the changes regex-pattern considers for a pattern, ordered by start
 * and, for one start, outer first: removing `^` and `$`, `\b` and `\B`,
 * lookaround assertions and alternatives, making an optional element required,
 * and widening a class or an escape to any character; with options also
 * narrowing quantifiers and moving their bounds, removing class elements and
 * narrowing ranges, negating classes and escapes, and removing alternatives
 * from long lists. A removal of a part with a capturing group, an anchor next
 * to an edge wildcard, a widening of what already matches any character and,
 * without the option, an alternative of a long list come with their skip.
 *
 * @param pattern - Pattern tree.
 * @param flags - Flags of the literal.
 * @param options - Options of the mutator.
 * @returns Changes with offsets relative to the pattern.
 */
export function collectPatternChanges(
  pattern: AST.Pattern,
  flags: string,
  options: Readonly<RegexPatternOptions>,
): RegexChange[] {
  let isUnicode = flags.includes('u') || flags.includes('v')
  let changes: RegexChange[] = []

  /**
   * Adds a change.
   *
   * @param range - Replaced part of the pattern.
   * @param range.start - Start of the part.
   * @param range.end - End of the part.
   * @param text - New text of the part.
   * @param skip - Skip of the change, or null.
   */
  function add(
    range: { start: number; end: number },
    text: string,
    skip: SkipNote | null = null,
  ): void {
    changes.push({ start: range.start, end: range.end, text, skip })
  }

  /**
   * Adds the removal of every alternative of a list of two or more.
   *
   * @param node - Node that holds the alternatives.
   * @param node.alternatives - Alternatives in pattern order, each a list of
   *   elements.
   */
  function removeAlternatives(node: { alternatives: AST.Alternative[] }): void {
    let { alternatives } = node
    if (alternatives.length < 2) {
      return
    }
    let isLarge =
      alternatives.length > MAX_ALTERNATIVES && !options.largeAlternations
    for (let [index, alternative] of alternatives.entries()) {
      let range =
        index === 0 ?
          { end: alternatives[1]!.start, start: alternative.start }
        : { start: alternatives[index - 1]!.end, end: alternative.end }
      let skip: SkipNote | null = null
      if (hasCapturingGroup(alternative)) {
        skip = CAPTURING_GROUP_SKIP
      } else if (isLarge) {
        skip = {
          reason: `the list has more than ${MAX_ALTERNATIVES} alternatives; removing each is noise without the largeAlternations option`,
          rule: 'large-alternation',
        }
      }
      add(range, '', skip)
    }
  }

  loadRegexpp().visitRegExpAST(pattern, {
    onAssertionEnter(node) {
      let target = node.parent.type === 'Quantifier' ? node.parent : node
      switch (node.kind) {
        case 'start':
        case 'end':
          add(
            target,
            '',
            isEdgeWildcard(node, flags) ?
              {
                reason:
                  'a wildcard that runs to the edge stands next to the anchor, so removing it keeps every match',
                rule: 'edge-wildcard',
              }
            : null,
          )
          break
        case 'word':
          add(target, '')
          break
        default:
          add(target, '', hasCapturingGroup(node) ? CAPTURING_GROUP_SKIP : null)
          removeAlternatives(node)
      }
    },
    onCharacterClassEnter(node) {
      if (isTopLevel(node)) {
        add(
          node,
          ANY_CHARACTER,
          matchesAnyCharacter(node, flags) ?
            {
              reason: 'the class already matches any character',
              rule: 'any-character',
            }
          : null,
        )
        if (options.negations) {
          add(getNegationRange(node), node.negate ? '' : '^')
        }
      }
      if (options.classMembers && node.elements.length >= 2) {
        for (let element of node.elements) {
          add(element, '')
        }
      }
    },
    onCharacterSetEnter(node) {
      if (node.kind === 'any') {
        return
      }
      if (isTopLevel(node)) {
        add(node, ANY_CHARACTER)
      }
      if (options.negations && (node.kind !== 'property' || !node.strings)) {
        let letter = node.raw[1]!
        let negated =
          letter === letter.toLowerCase() ?
            letter.toUpperCase()
          : letter.toLowerCase()
        add({ start: node.start + 1, end: node.start + 2 }, negated)
      }
    },
    onQuantifierEnter(node) {
      let range = { start: node.element.end, end: node.end }
      let { greedy, min, max } = node
      if (min === 0 && max > 0) {
        add(range, max === 1 ? '' : formatQuantifier(1, max, greedy))
      }
      if (!options.quantifiers) {
        return
      }
      for (let [newMin, newMax] of getBoundChanges(min, max)) {
        add(range, formatQuantifier(newMin, newMax, greedy))
      }
    },
    onCharacterClassRangeEnter(node) {
      if (!options.classMembers || node.min.value === node.max.value) {
        return
      }
      add(node.min, printCharacter(node.min.value + 1, isUnicode))
      add(node.max, printCharacter(node.max.value - 1, isUnicode))
    },
    onExpressionCharacterClassEnter(node) {
      if (isTopLevel(node)) {
        add(node, ANY_CHARACTER)
      }
      if (options.negations) {
        add(getNegationRange(node), node.negate ? '' : '^')
      }
    },
    onCharacterEnter(node) {
      if (
        options.negations &&
        node.raw === String.raw`\.` &&
        isTopLevel(node)
      ) {
        add(node, '.')
      }
    },
    onCapturingGroupEnter: removeAlternatives,
    onPatternEnter: removeAlternatives,
    onGroupEnter: removeAlternatives,
  })

  return changes.toSorted(
    (left, right) => left.start - right.start || right.end - left.end,
  )
}

/**
 * Prints a quantifier in its shortest form.
 *
 * @param min - Lower bound.
 * @param max - Upper bound, Infinity when unbounded.
 * @param greedy - Whether the quantifier is greedy; a lazy one keeps its `?`.
 * @returns Text after the quantified element, empty for exactly once.
 */
function formatQuantifier(min: number, max: number, greedy: boolean): string {
  if (min === 1 && max === 1) {
    return ''
  }
  let text: string
  if (min === 0 && max === 1) {
    text = '?'
  } else if (min === 0 && max === Infinity) {
    text = '*'
  } else if (min === 1 && max === Infinity) {
    text = '+'
  } else if (max === Infinity) {
    text = `{${min},}`
  } else if (min === max) {
    text = `{${min}}`
  } else {
    text = `{${min},${max}}`
  }
  return greedy ? text : `${text}?`
}

/**
 * Lists the quantifier bounds the `quantifiers` option tries: at most once
 * where more were allowed (`x+` to `x`, `x*` to `x?`, `{2,5}` to `{2}`), and
 * each bound moved by one where the result stays a valid, different quantifier
 * (`x+` to `x*` and `x{2,}`, `{2,5}` to `{1,5}`, `{3,5}`, `{2,4}` and
 * `{2,6}`).
 *
 * @param min - Lower bound.
 * @param max - Upper bound, Infinity when unbounded.
 * @returns New bounds as `[min, max]` pairs.
 */
function getBoundChanges(min: number, max: number): [number, number][] {
  let bounds: [number, number][] = []
  if (max > 1 && max > min) {
    bounds.push(min === 0 ? [0, 1] : [min, min])
  }
  if (min >= 1) {
    bounds.push([min - 1, max], [min + 1, Math.max(max, min + 1)])
  }
  if (max !== Infinity && max > 1 && max > min) {
    bounds.push([min, max - 1])
  }
  if (max !== Infinity && max >= 1 && (min !== 0 || max !== 1)) {
    bounds.push([min, max + 1])
  }
  return bounds
}

/**
 * Prints a character for a class range: a digit or ASCII letter as it is, any
 * other character as a Unicode escape.
 *
 * @param value - Code point or, without `u` and `v`, code unit.
 * @param isUnicode - Whether the pattern has `u` or `v`, which allow `\u{...}`.
 * @returns Text of the character.
 */
function printCharacter(value: number, isUnicode: boolean): string {
  let text = String.fromCodePoint(value)
  if (PLAIN_CHARACTER_PATTERN.test(text)) {
    return text
  }
  let hex = value.toString(16).toUpperCase()
  return isUnicode ?
      String.raw`\u{${hex}}`
    : String.raw`\u${hex.padStart(4, '0')}`
}

/**
 * Finds the part of a class that its negation replaces: the `^` after `[` of a
 * negated class, or the empty range after `[` of another.
 *
 * @param node - Class at the top level of the pattern.
 * @param node.negate - Whether the class is negated.
 * @param node.start - Offset of its `[`.
 * @returns Range relative to the pattern.
 */
function getNegationRange(node: { negate: boolean; start: number }): {
  start: number
  end: number
} {
  return { end: node.start + (node.negate ? 2 : 1), start: node.start + 1 }
}

/**
 * Tells whether an element stands outside any class, directly in an alternative
 * or under a quantifier.
 *
 * @param node - Element of a pattern.
 * @returns Whether the element matches on its own.
 */
function isTopLevel(node: AST.Node): boolean {
  let type = node.parent?.type
  return type === 'Alternative' || type === 'Quantifier'
}
