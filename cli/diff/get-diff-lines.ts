import type { ListReportDiff } from '../../types/report/list-report-diff'

import { getSourcePosition } from '../../core/text/get-source-position'
import { separateReplacement } from './separate-replacement'

/**
 * Line terminator: CRLF, CR, LF, U+2028 or U+2029.
 */
const LINE_TERMINATOR_PATTERN = /\r\n|[\n\r\u{2028}\u{2029}]/u

/**
 * Line terminator at the end of a line of text.
 */
const TRAILING_LINE_TERMINATOR_PATTERN = /(?:\r\n|[\n\r\u{2028}\u{2029}])$/u

/**
 * Most code units of unchanged text kept before and after an edit on its lines,
 * so a long line, such as a minified one, does not repeat in every mutant.
 */
const MAX_CONTEXT_LENGTH = 80

/**
 * Gets the source lines an edit touches, from the line of its start to the line
 * of its end, as read and with the edit applied, without line breaks. The
 * replacement is written as it is, so its line breaks split the lines after the
 * edit, with a space where it would merge with the text next to it (see
 * `separateReplacement`). The unchanged text of the lines keeps at most 80 code
 * units before and after the edit; how many it leaves out is counted, never
 * splitting a surrogate pair.
 *
 * @param source - Text of the file as read.
 * @param lineStarts - Line start offsets of the text.
 * @param edit - Range of the edit and its text.
 * @param edit.start - UTF-16 offset of the first replaced code unit.
 * @param edit.end - UTF-16 offset just past the last replaced code unit.
 * @param edit.replacement - Text written in place of the range.
 * @returns Lines before and after the edit.
 */
export function getDiffLines(
  source: string,
  lineStarts: readonly number[],
  edit: { replacement: string; start: number; end: number },
): ListReportDiff {
  let first = getSourcePosition(lineStarts, edit.start).line
  let last = getSourcePosition(lineStarts, edit.end).line
  let before: string[] = []
  for (let line = first; line <= last; line++) {
    before.push(
      source
        .slice(lineStarts[line - 1], lineStarts[line])
        .replace(TRAILING_LINE_TERMINATOR_PATTERN, ''),
    )
  }
  let lead = source.slice(lineStarts[first - 1], edit.start)
  let lastLine = before.at(-1)!
  let trail = lastLine.slice(edit.end - lineStarts[last - 1]!)
  let cutStart = getCut(lead, lead.length - MAX_CONTEXT_LENGTH)
  let cutEnd =
    trail.length - getCut(trail, Math.min(MAX_CONTEXT_LENGTH, trail.length))
  before[0] = before[0]!.slice(cutStart)
  before[before.length - 1] = before
    .at(-1)!
    .slice(0, before.at(-1)!.length - cutEnd)
  return {
    after: [
      lead.slice(cutStart),
      separateReplacement(source, edit),
      trail.slice(0, trail.length - cutEnd),
    ]
      .join('')
      .split(LINE_TERMINATOR_PATTERN),
    cutStart,
    before,
    cutEnd,
  }
}

/**
 * Moves a cut of a text off the middle of a surrogate pair.
 *
 * @param text - Text to cut.
 * @param index - Index the cut should be at; at most 0 for no cut.
 * @returns Index of the cut, 0 when the text is not cut.
 */
function getCut(text: string, index: number): number {
  if (index <= 0) {
    return 0
  }
  let code = text.charCodeAt(index)
  return code >= 0xdc_00 && code <= 0xdf_ff ? index + 1 : index
}
