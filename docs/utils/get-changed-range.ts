import type { ChangedPart } from '../../cli/diff/narrow-change'

import { narrowChange } from '../../cli/diff/narrow-change'

/**
 * Regular expression literal somewhere in a piece of code. Division has spaces
 * around its `/`, so it does not match.
 */
const REGEX_PATTERN = /\/[^\s/]+\/[a-z]*/u

/**
 * Parts of two versions of the same code.
 */
export interface ChangedRange {
  /**
   * Text after the change, the same in both versions.
   */
  suffix: string

  /**
   * Text before the change, the same in both versions.
   */
  prefix: string

  /**
   * Changed text of the original code.
   */
  before: string

  /**
   * Changed text of the mutant.
   */
  after: string
}

/**
 * Finds what a mutant changes in a piece of code, as the reports of Mootant
 * mark it: whole words and operators. A regular expression keeps the exact
 * characters, because its `/` and `^` are not one operator.
 *
 * @param before - Original code.
 * @param after - Code of the mutant.
 * @returns Common and changed parts of the two versions.
 */
export function getChangedRange(before: string, after: string): ChangedRange {
  let original = [...before]
  let replacement = [...after]
  let { replacementEnd, originalEnd, start } =
    REGEX_PATTERN.test(before) ?
      findExactChange(original, replacement)
    : narrowChange(original, replacement)
  return {
    after: replacement.slice(start, replacementEnd).join(''),
    before: original.slice(start, originalEnd).join(''),
    suffix: original.slice(originalEnd).join(''),
    prefix: original.slice(0, start).join(''),
  }
}

/**
 * Finds the characters between the common start and end of two texts.
 *
 * @param original - Characters of the original.
 * @param replacement - Characters of the replacement.
 * @returns Where the changed part lies.
 */
function findExactChange(
  original: string[],
  replacement: string[],
): ChangedPart {
  let start = 0
  while (
    start < original.length &&
    start < replacement.length &&
    original[start] === replacement[start]
  ) {
    start++
  }
  let originalEnd = original.length
  let replacementEnd = replacement.length
  while (
    originalEnd > start &&
    replacementEnd > start &&
    original[originalEnd - 1] === replacement[replacementEnd - 1]
  ) {
    originalEnd--
    replacementEnd--
  }
  return { replacementEnd, originalEnd, start }
}
