import type { TextStyle } from '../../types/cli/text-style'
import type { Color } from '../terminal/colors'

import { getMaxDisplayWidth } from '../terminal/get-max-display-width'
import { getDisplayWidth } from '../terminal/get-display-width'
import { formatByFile } from '../terminal/format-by-file'
import { padToWidth } from '../terminal/pad-to-width'
import { cutToWidth } from '../terminal/cut-to-width'
import { formatChange } from '../diff/format-change'
import { getSymbols } from '../terminal/get-symbols'

/**
 * One mutant or skipped candidate of a report, before its columns are aligned.
 */
export interface EntryRow {
  /**
   * Original and replacement texts.
   */
  change: { replacement: string; original: string }

  /**
   * Lines under the row, such as the reason of an error, without indentation.
   */
  details: string[]

  /**
   * `line:column` of the first changed character.
   */
  location: string

  /**
   * Id of the mutator.
   */
  mutator: string

  /**
   * Columns after the change, such as the id and the status; at least one.
   */
  tail: Cell[]

  /**
   * Path of the file, the heading of its group.
   */
  file: string
}

/**
 * Text of a column after the change, with its color.
 */
interface Cell {
  /**
   * Colors the text after it is padded; plain when omitted.
   */
  color?: Color

  /**
   * Plain text.
   */
  text: string
}

/**
 * Space between two columns.
 */
const GAP = '  '

/**
 * Indentation of the rows under their file.
 */
const INDENT = '  '

/**
 * Columns a change needs next to the other columns; with less room, changes go
 * on a line of their own under their row.
 */
const MIN_CHANGE_WIDTH = 30

/**
 * Fewest columns a change keeps however narrow the terminal is.
 */
const MIN_CUT_WIDTH = 12

/**
 * Changes up to this many columns always widen the change column.
 */
const MIN_PAD_WIDTH = 48

/**
 * Changes wider than the median change times this share, and wider than
 * `MIN_PAD_WIDTH`, do not widen the change column.
 */
const PAD_MEDIAN_SHARE = 1.5

/**
 * Formats report entries grouped by file: the path in bold, cut from its start
 * when wider than the line, then one indented row per entry with the location,
 * mutator, change and tail columns aligned within the group. Widths count
 * terminal columns, so wide characters such as Chinese text and emoji take two.
 * A change too wide for the line is cut. When the line leaves changes too
 * little room, as in a narrow terminal, each change goes on a line of its own
 * under its row, where it has the whole width. The change column is padded to
 * the widest change of the group, leaving out changes wider than 48 columns and
 * half again as wide as the median, so a few long changes do not push the tail
 * of every row away. Detail lines go under the mutator column, cut to the
 * width. Files keep the order their first entry has.
 *
 * @param rows - Entries in the order to print.
 * @param style - Colors, width and symbols of the output.
 * @returns Groups separated by an empty line, or an empty text without rows.
 */
export function formatFileGroups(
  rows: readonly EntryRow[],
  style: TextStyle,
): string {
  return formatByFile(rows, {
    formatGroup: group => formatGroup(group, style).join('\n'),
    getFile: row => row.file,
    style,
  })
}

/**
 * Formats the rows of one file with aligned columns.
 *
 * @param rows - Entries of the file.
 * @param style - Colors, width and symbols of the output.
 * @returns Lines of the group without its heading.
 */
function formatGroup(rows: readonly EntryRow[], style: TextStyle): string[] {
  let { colors, width } = style
  let { ellipsis, arrow } = getSymbols(style.unicode)
  let locationWidth = getMaxDisplayWidth(rows.map(row => row.location))
  let mutatorWidth = getMaxDisplayWidth(rows.map(row => row.mutator))
  let prefixWidth =
    INDENT.length + locationWidth + GAP.length + mutatorWidth + GAP.length
  let tailWidths = getTailWidths(rows)
  let detailIndent = ' '.repeat(INDENT.length + locationWidth + GAP.length)
  let detailRoom = Math.max(MIN_CUT_WIDTH, width - detailIndent.length)
  let room = width - prefixWidth - sumTailWidths(tailWidths)
  let below = room < MIN_CHANGE_WIDTH
  let changes = rows.map(row =>
    formatChange(row.change, {
      maxLength: below ? detailRoom : room,
      ellipsis,
      arrow,
    }),
  )
  let changeWidth = getPadWidth(changes.map(change => getDisplayWidth(change)))
  return rows.flatMap((row, rowIndex) => {
    let cells = row.tail.map((cell, index) => {
      let text =
        index === row.tail.length - 1 ?
          cell.text
        : padToWidth(cell.text, tailWidths[index]!)
      return cell.color === undefined ? text : cell.color(text)
    })
    let change = changes[rowIndex]!
    let line = [
      `${INDENT}${colors.gray(padToWidth(row.location, locationWidth))}`,
      colors.gray(padToWidth(row.mutator, mutatorWidth)),
      ...(below ? [] : [padToWidth(change, changeWidth)]),
      ...cells,
    ].join(GAP)
    return [
      line,
      ...(below ? [`${detailIndent}${change}`] : []),
      ...row.details.map(
        detail =>
          `${detailIndent}${colors.gray(cutToWidth(detail, { width: detailRoom, ellipsis }))}`,
      ),
    ]
  })
}

/**
 * Picks the width the change column is padded to: the widest change, leaving
 * out changes wider than both `MIN_PAD_WIDTH` and the median times
 * `PAD_MEDIAN_SHARE`, so a few long changes do not widen every row.
 *
 * @param widths - Columns of every change of the group.
 * @returns Width to pad changes to; wider changes stay as they are.
 */
function getPadWidth(widths: readonly number[]): number {
  let sorted = widths.toSorted((left, right) => left - right)
  let median = sorted[Math.floor((sorted.length - 1) / 2)]!
  let limit = Math.max(MIN_PAD_WIDTH, Math.round(median * PAD_MEDIAN_SHARE))
  return sorted.findLast(change => change <= limit)!
}

/**
 * Finds the width of every tail column: the widest text of the column.
 *
 * @param rows - Entries with their tail columns.
 * @returns Columns of each tail column, in order.
 */
function getTailWidths(rows: readonly EntryRow[]): number[] {
  let widths: number[] = []
  for (let row of rows) {
    for (let [index, cell] of row.tail.entries()) {
      widths[index] = Math.max(widths[index] ?? 0, getDisplayWidth(cell.text))
    }
  }
  return widths
}

/**
 * Counts the columns the tail columns take, a gap before each included.
 *
 * @param widths - Columns of each tail column.
 * @returns Columns after the change.
 */
function sumTailWidths(widths: readonly number[]): number {
  return widths.reduce((sum, cellWidth) => sum + GAP.length + cellWidth, 0)
}
