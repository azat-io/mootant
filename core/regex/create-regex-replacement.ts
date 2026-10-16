import type { PresetSettings } from '../../types/config/preset-settings'
import type { Replacement } from '../../types/mutator/replacement'
import type { RegexSource } from '../../types/regex/regex-source'
import type { TextEdit } from '../../types/source/text-edit'
import type { SkipNote } from '../../types/mutant/skip-note'

import { isValidRegexLiteral } from './is-valid-regex-literal'
import { keepsNeighborTokens } from './keeps-neighbor-tokens'
import { isRawTemplateText } from './is-raw-template-text'
import { parseRegexPattern } from './parse-regex-pattern'
import { printPatternEdit } from './print-pattern-edit'
import { printFlagsEdit } from './print-flags-edit'
import { canMatchEmpty } from './can-match-empty'
import { compilesRegex } from './compiles-regex'

/**
 * Change of a regex mutant, with the skip the mutator decided.
 */
interface RegexEdit {
  /**
   * Edit of the pattern with offsets relative to it, or null when only the
   * flags change.
   */
  change: TextEdit | null

  /**
   * Skip the mutator decided, or null.
   */
  skip: SkipNote | null

  /**
   * New flags.
   */
  flags: string
}

/**
 * Builds the replacement of a regex mutant: the node that holds the pattern, or
 * the one that holds the flags, printed anew, with the edit inside it as the
 * focus of reports. A change that the mutator skipped keeps its skip. Otherwise
 * a regular expression that would not compile, a literal that would not parse
 * as one literal, and a `String.raw` template that cannot hold the new pattern
 * are skipped as invalid, since a broken literal breaks the whole file, as is a
 * pattern edit that merges its neighbors into a different token, and, without
 * the `timeouts` setting, a pattern with `g` or `y` that starts to match the
 * empty string is skipped, since a `while (re.exec(s))` loop over it never
 * ends.
 *
 * @param source - The regular expression as read.
 * @param edit - Pattern edit or new flags, and the skip of the mutator.
 * @param settings - Settings of the preset.
 * @returns The replacement, skipped or not.
 */
export function createRegexReplacement(
  source: RegexSource,
  edit: RegexEdit,
  settings: Readonly<PresetSettings>,
): Replacement {
  let { change, flags } = edit
  let replacement: Replacement =
    change ?
      { ...printPatternEdit(source, change), node: source.node }
    : printFlagsEdit(source, flags)
  let note = edit.skip ?? getRegexSkip(source, edit, settings)
  if (note) {
    replacement.skip = note
  }
  return replacement
}

/**
 * Decides whether a regex mutant is skipped for its result.
 *
 * @param source - The regular expression as read.
 * @param edit - Pattern edit or new flags.
 * @param settings - Settings of the preset.
 * @returns Rule and reason of the skip, or null.
 */
function getRegexSkip(
  source: RegexSource,
  edit: RegexEdit,
  settings: Readonly<PresetSettings>,
): SkipNote | null {
  let { change, flags } = edit
  let pattern =
    change ?
      `${source.pattern.slice(0, change.start)}${change.text}${source.pattern.slice(change.end)}`
    : source.pattern
  if (!isValidPattern(source.form, pattern, flags)) {
    return {
      reason: 'the new regular expression would not compile',
      rule: 'invalid-regex',
    }
  }
  if (change && !keepsNeighborTokens(source.tree, flags, change)) {
    return {
      reason:
        'the edit would merge the parts around it into a different token, so the mutant would not be the change it reports',
      rule: 'invalid-regex',
    }
  }
  if (
    change &&
    !settings.timeouts &&
    /[gy]/u.test(flags) &&
    !canMatchEmpty(source.tree) &&
    canMatchEmpty(parseRegexPattern(pattern, flags)!)
  ) {
    return {
      reason:
        'the new pattern matches the empty string, so a loop over its global matches could never end',
      rule: 'empty-match',
    }
  }
  return null
}

/**
 * Tells whether a new pattern can be written in the source form and compiles.
 *
 * @param form - Source form of the regular expression.
 * @param pattern - New pattern.
 * @param flags - New flags.
 * @returns Whether the new regular expression is valid.
 */
function isValidPattern(
  form: RegexSource['form'],
  pattern: string,
  flags: string,
): boolean {
  switch (form) {
    case 'literal':
      return isValidRegexLiteral(pattern, flags)
    case 'raw':
      return isRawTemplateText(pattern) && compilesRegex(pattern, flags)
    default:
      return compilesRegex(pattern, flags)
  }
}
