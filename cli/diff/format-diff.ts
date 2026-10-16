import type { MarkedGrapheme, MarkedDiff } from './mark-diff'
import type { TextStyle } from '../../types/cli/text-style'
import type { Color } from '../terminal/colors'

import {
  getGraphemeWidth,
  getDisplayWidth,
  splitGraphemes,
} from '../terminal/get-display-width'
import { getSymbols } from '../terminal/get-symbols'
import { isJoined } from './is-joined'

/**
 * Most changed lines shown of each side; more show their first lines, how many
 * are left out and their last line.
 */
const MAX_LINES = 4

/**
 * Changed lines a longer side shows before the lines it leaves out.
 */
const HEAD_LINES = 2

/**
 * Unchanged lines shown next to the changed ones, before and after them.
 */
const CONTEXT_LINES = 1

/**
 * Columns of unchanged text kept before a change too wide to show whole.
 */
const LEAD_WIDTH = 4

/**
 * Fewest columns a line keeps however narrow the output is.
 */
const MIN_WIDTH = 12

/**
 * Line of a side as printed: marked characters, or a note of left-out lines.
 */
type DiffLine = { skipped: number } | MarkedGrapheme[]

/**
 * Formats the source lines of a mutant as a diff: the lines as read after `-`,
 * the lines with the mutant applied after `+`, the changed characters in red
 * and green. The indentation the lines share is removed and tabs become two
 * spaces. Of the unchanged lines around the change each side shows one before
 * and one after it, naming how many it leaves out; of more than four changed
 * lines it shows the first two, how many it leaves out and the last. Lines
 * wider than the width are cut with an ellipsis, every line of the mutant at
 * the same columns, so the change stays in view with as much text around it as
 * fits and both sides line up; a line the report already cut shows an ellipsis
 * there too. Widths count terminal columns, so wide characters such as Chinese
 * text and emoji take two.
 *
 * @param diff - Marked lines of the mutant.
 * @param style - Colors, width and symbols of the output.
 * @returns Lines without indentation.
 */
export function formatDiff(diff: MarkedDiff, style: TextStyle): string[] {
  let { colors } = style
  let { ellipsis } = getSymbols(style.unicode)
  let mark = splitGraphemes(ellipsis).map(text => ({ changed: false, text }))
  let sides = trimIndentation([
    diff.before.map(expandTabs),
    diff.after.map(expandTabs),
  ]).map(lines => {
    if (diff.cutStart) {
      lines[0] = [...mark, ...lines[0]!]
    }
    if (diff.cutEnd) {
      lines[lines.length - 1] = [...lines.at(-1)!, ...mark]
    }
    return lines
  })
  let [before, after] = shortenSides(sides[0]!, sides[1]!)
  let room = Math.max(MIN_WIDTH, style.width - 2)
  let offset = getOffset([...before, ...after], room, getDisplayWidth(ellipsis))

  /**
   * Formats the lines of one side.
   *
   * @param lines - Marked lines of the side, or notes of left-out ones.
   * @param marker - Sign of the side: `-` before the mutant, `+` after.
   * @param color - Color of the marker and the changed characters.
   * @returns Lines with their marker.
   */
  function formatSide(
    lines: readonly DiffLine[],
    marker: string,
    color: Color,
  ): string[] {
    return lines.map(line => {
      let text =
        Array.isArray(line) ?
          cutLine(line, { ellipsis, offset, color, style, room })
        : colors.gray(`${ellipsis} ${line.skipped} lines`)
      return text === '' ? color(marker) : `${color(marker)} ${text}`
    })
  }

  return [
    ...formatSide(before, '-', colors.red),
    ...formatSide(after, '+', colors.green),
  ]
}

/**
 * Picks the first column shown of every line: 0 when the changed characters
 * fit, else the column that shows them with as much text around them as fits,
 * the text after them taking at most half the spare room and the text before
 * them starting with a whole word unless that leaves out more than half of it,
 * or, when even they do not fit, a few columns before their start, at the start
 * of a word.
 *
 * @param lines - Lines of both sides.
 * @param room - Columns of a line.
 * @param ellipsisWidth - Columns of the mark of a cut.
 * @returns Column the visible part of every line starts at.
 */
function getOffset(
  lines: readonly DiffLine[],
  room: number,
  ellipsisWidth: number,
): number {
  let widest = 0
  let changeStart = Infinity
  let changeEnd = 0
  let changedLine: readonly MarkedGrapheme[] = []
  for (let line of lines) {
    if (!Array.isArray(line)) {
      continue
    }
    let column = 0
    for (let grapheme of line) {
      let width = getGraphemeWidth(grapheme.text)
      if (grapheme.changed) {
        if (column < changeStart) {
          changeStart = column
          changedLine = line
        }
        changeEnd = Math.max(changeEnd, column + width)
      }
      column += width
    }
    widest = Math.max(widest, column)
  }
  if (widest <= room || changeEnd <= room - ellipsisWidth) {
    return 0
  }
  let spare = room - (changeEnd - changeStart) - ellipsisWidth * 2
  let rest = widest - changeEnd
  let trail = Math.min(rest, Math.floor(spare / 2))
  let offset =
    spare <= 0 ?
      changeStart - ellipsisWidth - LEAD_WIDTH
    : changeEnd + trail + (trail < rest ? ellipsisWidth : 0) - room
  if (offset <= 0) {
    return 0
  }
  let column = 0
  let snapLimit = spare <= 0 ? changeStart : offset + (changeStart - offset) / 2
  for (let [index, grapheme] of changedLine.entries()) {
    if (column >= changeStart || column > snapLimit) {
      break
    }
    if (
      column >= offset + ellipsisWidth &&
      !isJoined(changedLine[index - 1]!.text, grapheme.text)
    ) {
      return column - ellipsisWidth
    }
    column += getGraphemeWidth(grapheme.text)
  }
  return offset
}

/**
 * Cuts a line to the columns from the offset, marking each cut end with an
 * ellipsis, and colors its changed characters.
 *
 * @param line - Marked characters of the line.
 * @param view - Visible columns, colors and symbols.
 * @param view.offset - First visible column.
 * @param view.room - Columns of the line.
 * @param view.color - Color of the changed characters.
 * @param view.ellipsis - Mark of a cut.
 * @param view.style - Colors of the output.
 * @returns The visible part, possibly empty.
 */
function cutLine(
  line: readonly MarkedGrapheme[],
  view: {
    ellipsis: string
    style: TextStyle
    offset: number
    color: Color
    room: number
  },
): string {
  let { ellipsis, offset, color, style, room } = view
  let ellipsisWidth = getDisplayWidth(ellipsis)
  let width = line.reduce(
    (sum, grapheme) => sum + getGraphemeWidth(grapheme.text),
    0,
  )
  let first = offset > 0 ? offset + ellipsisWidth : 0
  let last = width > offset + room ? offset + room - ellipsisWidth : Infinity
  let text = offset > 0 ? style.colors.gray(ellipsis) : ''
  let column = 0
  let run = ''
  let changed = false
  for (let grapheme of line) {
    let start = column
    column += getGraphemeWidth(grapheme.text)
    if (start < first || column > last) {
      continue
    }
    if (grapheme.changed !== changed) {
      text += changed ? color(run) : run
      run = ''
      changed = !changed
    }
    run += grapheme.text
  }
  text += changed ? color(run) : run
  return last === Infinity ? text : `${text}${style.colors.gray(ellipsis)}`
}

/**
 * Leaves out the unchanged lines of both sides but the ones next to the change,
 * and the middle changed lines of a side with more than `MAX_LINES`. Lines
 * before the first changed character and after the last one are the same on
 * both sides, so a side without changed characters, such as the side a removal
 * leaves, takes them from the other side.
 *
 * @param before - Lines as read.
 * @param after - Lines with the mutant applied.
 * @returns Lines of both sides to print.
 */
function shortenSides(
  before: MarkedGrapheme[][],
  after: MarkedGrapheme[][],
): [DiffLine[], DiffLine[]] {
  let lead = Infinity
  let trail = Infinity
  for (let lines of [before, after]) {
    let changed = lines.flatMap((line, index) =>
      line.some(grapheme => grapheme.changed) ? [index] : [],
    )
    if (changed.length > 0) {
      lead = Math.min(lead, changed[0]!)
      trail = Math.min(trail, lines.length - 1 - changed.at(-1)!)
    }
  }
  if (lead === Infinity) {
    return [before, after]
  }
  trail = Math.min(trail, before.length - lead, after.length - lead)
  return [before, after].map(lines => [
    ...shortenRun(lines.slice(0, lead), 'start'),
    ...shortenRun(lines.slice(lead, lines.length - trail), 'middle'),
    ...shortenRun(lines.slice(lines.length - trail), 'end'),
  ]) as [DiffLine[], DiffLine[]]
}

/**
 * Removes the leading spaces every line that is not blank has, from every line
 * of both sides.
 *
 * @param sides - Lines before and after the mutant.
 * @returns Both sides without the shared indentation.
 */
function trimIndentation(sides: MarkedGrapheme[][][]): MarkedGrapheme[][][] {
  let shared = Infinity
  for (let line of sides.flat()) {
    let indentation = line.findIndex(grapheme => grapheme.text !== ' ')
    if (indentation !== -1) {
      shared = Math.min(shared, indentation)
    }
  }
  if (shared === Infinity) {
    return sides
  }
  return sides.map(lines =>
    lines.map(line => {
      let indentation = line.findIndex(grapheme => grapheme.text !== ' ')
      return line.slice(
        Math.min(shared, indentation === -1 ? line.length : indentation),
      )
    }),
  )
}

/**
 * Leaves out lines of a run, naming how many, when that saves lines: of
 * unchanged lines before the change all but the last, of unchanged lines after
 * it all but the first, of changed lines all but the first two and the last.
 *
 * @param lines - Lines of one side in a row, all unchanged or all changed.
 * @param place - Where the run lies: before, in or after the change.
 * @returns Lines to print.
 */
function shortenRun(
  lines: MarkedGrapheme[][],
  place: 'middle' | 'start' | 'end',
): DiffLine[] {
  if (place === 'middle') {
    return lines.length <= MAX_LINES ?
        lines
      : [
          ...lines.slice(0, HEAD_LINES),
          { skipped: lines.length - HEAD_LINES - 1 },
          lines.at(-1)!,
        ]
  }
  let skipped = lines.length - CONTEXT_LINES
  if (skipped < 2) {
    return lines
  }
  return place === 'start' ?
      [{ skipped }, ...lines.slice(skipped)]
    : [...lines.slice(0, CONTEXT_LINES), { skipped }]
}

/**
 * Turns every tab of a line into two spaces, so widths count right.
 *
 * @param line - Marked characters of a line.
 * @returns The line without tabs.
 */
function expandTabs(line: MarkedGrapheme[]): MarkedGrapheme[] {
  return line.flatMap(grapheme =>
    grapheme.text === '\t' ?
      [
        { changed: grapheme.changed, text: ' ' },
        { changed: grapheme.changed, text: ' ' },
      ]
    : [grapheme],
  )
}
