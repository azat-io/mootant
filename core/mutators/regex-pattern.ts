import type { RegexPatternOptions } from '../../types/mutator/regex-pattern-options'
import type { MutatorContext } from '../../types/mutator/mutator-context'
import type { Replacement } from '../../types/mutator/replacement'
import type { RegexSource } from '../../types/regex/regex-source'
import type { RegexChange } from '../../types/regex/regex-change'
import type { Mutator } from '../../types/mutator/mutator'

import { createRegexReplacement } from '../regex/create-regex-replacement'
import { collectPatternChanges } from '../regex/collect-pattern-changes'
import { createRegexVisitors } from '../regex/create-regex-visitors'

/**
 * Changes the pattern of a regular expression literal, or of the string,
 * template or `String.raw` argument of a `RegExp` call with known flags:
 * removes `^`, `$`, `\b`, `\B`, a lookaround or an alternative, makes an
 * optional element required, or widens a class or an escape to any character;
 * the options add quantifier, class member and negation changes and removals
 * from long alternations. In a template with expressions only an `^` at its
 * start and a `$` at its end that follows written text other than a backslash
 * are removed, since an expression just before the `$` may escape it, and they
 * are never skipped as equivalent, since an expression may change the meaning
 * of the tokens around it. Each mutant replaces the whole literal, written in
 * the same form with the same quotes and escapes; reports show the changed part
 * of the pattern. Removals of capturing groups, anchors next to an edge
 * wildcard, widening of what already matches any character, invalid regular
 * expressions and, without the `timeouts` setting, patterns with `g` or `y`
 * that start to match the empty string are skipped. A regular expression that
 * does not compile is not changed.
 */
export let regexPattern: Mutator<RegexPatternOptions> = {
  meta: {
    description:
      'Removes an anchor, assertion or alternative of a regular expression, makes an optional part required, or widens a class to any character.',
    defaultOptions: {
      largeAlternations: false,
      classMembers: false,
      quantifiers: false,
      negations: false,
    },
  },
  create(context) {
    return createRegexVisitors(context, source =>
      mutatePattern(source, context),
    )
  },
}

/**
 * Builds the replacements of the pattern changes of a regular expression. A
 * template with expressions keeps only the removal of an `^` at its start and a
 * `$` at its end whose meaning no expression can change, and drops the
 * equivalent skip of such a removal: the pattern is analyzed with `(?:)` in
 * place of each expression, but an expression may end with a backslash that
 * escapes the next character (`${part}.*$` with `part` set to `a\\` is `a\.*$`,
 * whose dot is literal), open or close a class, or make the wildcard after a
 * `^` lazy or add an alternative after it, which `split` tells apart. The skips
 * that keep a mutant valid or a loop finite are decided later on the `(?:)`
 * placeholders and miss nothing: removing such an anchor keeps a valid pattern
 * valid whatever the expressions hold, and never changes whether it can match
 * the empty string.
 *
 * @param source - The regular expression as read.
 * @param context - Mutator context of the file.
 * @returns Replacements, skipped or not.
 */
function mutatePattern(
  source: RegexSource,
  context: MutatorContext<RegexPatternOptions>,
): Replacement[] {
  let { pattern, flags, tree } = source
  let changes = collectPatternChanges(tree, flags, context.options)
  if (source.dynamic) {
    changes = changes
      .filter(change => isEdgeAnchorRemoval(change, pattern))
      .map(change => ({ ...change, skip: null }))
  }
  return changes.map(change =>
    createRegexReplacement(
      source,
      {
        change: { start: change.start, text: change.text, end: change.end },
        skip: change.skip,
        flags,
      },
      context.settings,
    ),
  )
}

/**
 * Tells whether a change removes the `^` that starts the pattern of a template
 * with expressions, or the `$` that ends it, so that it stays the anchor
 * whatever the expressions hold. Nothing comes before the `^`, and an
 * expression after it that would quantify it makes the regular expression
 * invalid with or without it. The `$` must follow written text other than a
 * backslash: an expression just before it, where the pattern holds the `(?:)`
 * placeholder, may end with a backslash that escapes it, as `${part}$` with
 * `part` set to `\\` does, and the pattern without the `$` would not compile. A
 * `(?:)` written in the template counts as an expression.
 *
 * @param change - Change of the pattern.
 * @param pattern - Pattern the change applies to, with `(?:)` for each
 *   expression.
 * @returns Whether the change removes an edge anchor that no expression can
 *   change.
 */
function isEdgeAnchorRemoval(change: RegexChange, pattern: string): boolean {
  let { start, text, end } = change
  if (text !== '' || end - start !== 1) {
    return false
  }
  if (start === 0) {
    return pattern[0] === '^'
  }
  let before = pattern.slice(0, start)
  return (
    end === pattern.length &&
    pattern[start] === '$' &&
    !before.endsWith('\\') &&
    !before.endsWith('(?:)')
  )
}
