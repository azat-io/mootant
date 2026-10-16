import type { RegexFlagOptions } from '../../types/mutator/regex-flag-options'
import type { MutatorContext } from '../../types/mutator/mutator-context'
import type { Replacement } from '../../types/mutator/replacement'
import type { RegexSource } from '../../types/regex/regex-source'
import type { SkipNote } from '../../types/mutant/skip-note'
import type { Mutator } from '../../types/mutator/mutator'

import { createRegexReplacement } from '../regex/create-regex-replacement'
import { hasCasedCharacter } from '../regex/has-cased-character'
import { readRegexArgument } from '../regex/read-regex-argument'
import { readRegexLiteral } from '../regex/read-regex-literal'
import { readRegexCall } from '../regex/read-regex-call'
import { getRegexUsage } from '../regex/get-regex-usage'
import { canMatchEmpty } from '../regex/can-match-empty'
import { loadRegexpp } from '../regex/load-regexpp'

/**
 * Flags removed wherever the regular expression stands.
 */
const REMOVABLE_FLAGS = 'ims'

/**
 * Removes a flag of a regular expression literal, or of a `RegExp` call whose
 * pattern is a string, a template without expressions or a `String.raw`
 * template and whose flags are absent or a literal: `i`, `m` or `s` anywhere,
 * and `g` only in the first argument of a `.replace` or `.match` call, where it
 * picks between the first match and all of them. With the `additions` option it
 * also adds `i` to a pattern with cased characters and `g` to the pattern of a
 * `.replace` call. Removing `i` without cased characters, `m` without anchors
 * or `s` without `.`, `g` from a `.replace` pattern anchored at the start or
 * the end, and `g` from a `.match` call whose result is used only as true or
 * false, are skipped as equivalent. `u`, `v`, `y` and `d` are never changed,
 * and `g` elsewhere is kept: removing it there is equivalent, throws in
 * `matchAll` and `replaceAll`, or never ends a `while (re.exec(s))` loop. New
 * flags of a call are printed as a string; a call without flags gets them as a
 * second argument. A regular expression that does not compile is not changed.
 */
export let regexFlag: Mutator<RegexFlagOptions> = {
  create(context) {
    let { sourceCode } = context

    /**
     * Changes the flags of a call of `RegExp` whose pattern is known.
     *
     * @param node - Call or `new` expression.
     * @returns Replacements of the flags argument or of the call.
     */
    function visitCall(
      node: Parameters<typeof readRegexCall>[0],
    ): Replacement[] {
      let call = readRegexCall(node, context)
      let source = call && readRegexArgument(call, sourceCode.text)
      return source && !source.dynamic ? getFlagChanges(source, context) : []
    }

    return {
      Literal(node) {
        let source = readRegexLiteral(node, sourceCode.text)
        return source ? getFlagChanges(source, context) : []
      },
      CallExpression: visitCall,
      NewExpression: visitCall,
    }
  },
  meta: {
    description:
      'Removes a flag of a regular expression (i, m, s, or g where it picks all matches).',
    defaultOptions: { additions: false },
  },
}

/**
 * Lists the flag changes of a regular expression in flag order, removals first.
 *
 * @param source - The regular expression as read.
 * @param context - Mutator context of the file.
 * @returns Replacements of the regular expression, skipped or not.
 */
function getFlagChanges(
  source: RegexSource,
  context: MutatorContext<RegexFlagOptions>,
): Replacement[] {
  let { settings, options, syntax } = context
  let { expression, flags, tree } = source
  let usage = getRegexUsage(expression, syntax)
  let cased = hasCasedCharacter(tree, flags)
  let features = getPatternFeatures(source)
  let replacements: Replacement[] = []

  /**
   * Adds the replacement with new flags.
   *
   * @param newFlags - Flags of the mutant.
   * @param skip - Skip of the change, or null.
   */
  function add(newFlags: string, skip: SkipNote | null): void {
    replacements.push(
      createRegexReplacement(
        source,
        { flags: newFlags, change: null, skip },
        settings,
      ),
    )
  }

  /**
   * Decides whether removing a flag is skipped.
   *
   * @param flag - `g`, `i`, `m` or `s`.
   * @returns Rule and reason of the skip, or null.
   */
  function getRemovalSkip(flag: string): SkipNote | null {
    let isUsed: boolean
    switch (flag) {
      case 'g':
        if (usage === 'replace' && isAnchored(source)) {
          return {
            reason:
              'the pattern is anchored at the start or the end, so it matches at most once with or without g',
            rule: 'anchored-global',
          }
        }
        if (
          usage === 'match' &&
          syntax.isBooleanContext(syntax.getContextSlot(expression).parent!)
        ) {
          return {
            reason:
              'only the truthiness of the match is used, and g does not change whether there is one',
            rule: 'unused-flag',
          }
        }
        return null
      case 'i':
        isUsed = cased
        break
      case 'm':
        isUsed = features.anchors
        break
      default:
        isUsed = features.dots
    }
    return isUsed ? null : (
        {
          reason: `the pattern has nothing the ${flag} flag changes`,
          rule: 'unused-flag',
        }
      )
  }

  for (let flag of flags) {
    if (REMOVABLE_FLAGS.includes(flag) || (flag === 'g' && usage !== null)) {
      add(flags.replace(flag, ''), getRemovalSkip(flag))
    }
  }
  if (options.additions) {
    if (cased && !flags.includes('i')) {
      add(`${flags}i`, null)
    }
    if (usage === 'replace' && !flags.includes('g')) {
      add(`${flags}g`, null)
    }
  }
  return replacements
}

/**
 * Tells whether a pattern matches at most once in a text, with or without `g`,
 * and the regular expression has no `m` flag: every top-level alternative
 * starts with `^`, or every one ends with `$` and the pattern cannot match the
 * empty string. A match that ends at the end of the text leaves only an empty
 * match after it.
 *
 * @param source - The regular expression as read.
 * @returns Whether the pattern is anchored at the start or the end.
 */
function isAnchored(source: RegexSource): boolean {
  let { flags, tree } = source
  if (flags.includes('m')) {
    return false
  }
  return (
    tree.alternatives.every(alternative => {
      let [first] = alternative.elements
      return first?.type === 'Assertion' && first.kind === 'start'
    }) ||
    (!canMatchEmpty(tree) &&
      tree.alternatives.every(alternative => {
        let last = alternative.elements.at(-1)
        return last?.type === 'Assertion' && last.kind === 'end'
      }))
  )
}

/**
 * Finds what the `m` and `s` flags act on in a pattern.
 *
 * @param source - The regular expression as read.
 * @returns Whether the pattern has `^` or `$`, and whether it has `.`.
 */
function getPatternFeatures(source: RegexSource): {
  anchors: boolean
  dots: boolean
} {
  let features = { anchors: false, dots: false }
  loadRegexpp().visitRegExpAST(source.tree, {
    onAssertionEnter(assertion) {
      features.anchors ||=
        assertion.kind === 'start' || assertion.kind === 'end'
    },
    onCharacterSetEnter(set) {
      features.dots ||= set.kind === 'any'
    },
  })
  return features
}
