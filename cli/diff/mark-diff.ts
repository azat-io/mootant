import type { ListReportFocus } from '../../types/report/list-report-focus'
import type { ListReportDiff } from '../../types/report/list-report-diff'

import { splitGraphemes } from '../terminal/get-display-width'
import { narrowChange } from './narrow-change'

/**
 * Source lines of a mutant before and after it is applied, with the changed
 * characters marked.
 */
export interface MarkedDiff {
  /**
   * Lines as read.
   */
  before: MarkedGrapheme[][]

  /**
   * Lines with the mutant applied.
   */
  after: MarkedGrapheme[][]

  /**
   * Whether the first line of both sides is cut at its start.
   */
  cutStart: boolean

  /**
   * Whether the last line of both sides is cut at its end.
   */
  cutEnd: boolean
}

/**
 * Character of a source line, as people see it, and whether a mutant changes
 * it.
 */
export interface MarkedGrapheme {
  /**
   * Whether the character belongs to the changed part.
   */
  changed: boolean

  /**
   * One grapheme.
   */
  text: string
}

/**
 * Marks the characters a mutant changes in its source lines. With a focus that
 * the replacement applies as it is, the focus is marked, such as the edited
 * part of a regular expression; otherwise the part of the range that differs,
 * widened to whole words and operators, so `a ?? B` and `a || b` mark `??` and
 * `||` rather than the whole expression. Columns count from the start of the
 * line, so a line cut at its start shifts them.
 *
 * @param mutant - Mutant with its position and source lines.
 * @param mutant.before - Source lines before the mutant.
 * @param mutant.after - Source lines after the mutant.
 * @param mutant.cutStart - Code units left out at the start of the first line.
 * @param mutant.cutEnd - Code units left out at the end of the last line.
 * @param mutant.column - 1-based column of the first replaced character.
 * @param mutant.endColumn - 1-based column past the last replaced character.
 * @param mutant.line - 1-based line of the first replaced character.
 * @param mutant.focus - Part of the range the change amounts to, if any.
 * @returns Lines with the changed characters marked.
 */
export function markDiff(
  mutant: {
    focus?: ListReportFocus
    endColumn: number
    column: number
    line: number
  } & ListReportDiff,
): MarkedDiff {
  let { cutStart, cutEnd } = mutant
  let before = mutant.before.join('\n')
  let after = mutant.after.join('\n')
  let start = mutant.column - 1 - cutStart
  let lastCut = mutant.before.length === 1 ? cutStart : 0
  let trail = mutant.before.at(-1)!.length - (mutant.endColumn - 1 - lastCut)
  let ranges = {
    replacementEnd: after.length - trail,
    originalEnd: before.length - trail,
  }
  let narrow = true
  let { focus } = mutant
  if (focus) {
    let focusStart =
      mutant.before
        .slice(0, focus.line - mutant.line)
        .reduce((offset, text) => offset + text.length + 1, 0) +
      focus.column -
      1 -
      (focus.line === mutant.line ? cutStart : 0)
    let focusEnd = focusStart + focus.original.length
    if (
      after ===
      `${before.slice(0, focusStart)}${focus.replacement}${before.slice(focusEnd)}`
    ) {
      start = focusStart
      ranges = {
        replacementEnd: focusStart + focus.replacement.length,
        originalEnd: focusEnd,
      }
      narrow = false
    }
  }
  let lead = splitGraphemes(before.slice(0, start))
  let removed = splitGraphemes(before.slice(start, ranges.originalEnd))
  let added = splitGraphemes(after.slice(start, ranges.replacementEnd))
  let rest = splitGraphemes(before.slice(ranges.originalEnd))
  let originalGraphemes = [...lead, ...removed, ...rest]
  let replacementGraphemes = [...lead, ...added, ...rest]
  let part = {
    replacementEnd: lead.length + added.length,
    originalEnd: lead.length + removed.length,
    start: lead.length,
  }
  if (narrow) {
    part = narrowChange(originalGraphemes, replacementGraphemes, part)
  }
  return {
    after: splitLines(replacementGraphemes, part.start, part.replacementEnd),
    before: splitLines(originalGraphemes, part.start, part.originalEnd),
    cutStart: cutStart > 0,
    cutEnd: cutEnd > 0,
  }
}

/**
 * Splits graphemes into lines at line feeds, marking the ones in a range.
 *
 * @param graphemes - Graphemes of the lines joined with line feeds.
 * @param start - Index of the first changed grapheme.
 * @param end - Index just past the last changed grapheme.
 * @returns Marked lines without the line feeds.
 */
function splitLines(
  graphemes: readonly string[],
  start: number,
  end: number,
): MarkedGrapheme[][] {
  let lines: MarkedGrapheme[][] = [[]]
  for (let [index, text] of graphemes.entries()) {
    if (text === '\n') {
      lines.push([])
    } else {
      lines.at(-1)!.push({ changed: index >= start && index < end, text })
    }
  }
  return lines
}
