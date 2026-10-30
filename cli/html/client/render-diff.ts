import type { ShownChange } from '../../../types/html/shown-change'

import { getSourcePosition } from '../../../core/text/get-source-position'
import { separateReplacement } from '../../diff/separate-replacement'
import { getLineEnd } from './get-line-end'
import { escapeHtml } from './escape-html'

/**
 * Part of a line of the diff.
 */
interface Piece {
  /**
   * Whether the change made it.
   */
  changed?: boolean

  /**
   * Whether it stands for lines left out.
   */
  cut?: boolean

  /**
   * Text of the part.
   */
  text: string
}

/**
 * Line terminators of JavaScript, which split the rows of a diff.
 */
const LINE_TERMINATOR = /\r\n|[\n\r\u{2028}\u{2029}]/u

/**
 * Most characters of unchanged text kept before the change on its line.
 */
const HEAD_ROOM = 30

/**
 * Most characters of unchanged text kept after the change on its line.
 */
const TAIL_ROOM = 40

/**
 * Most lines of one side of the diff; longer sides keep their first and last
 * lines.
 */
const MAX_ROWS = 8

/**
 * Renders a change as the lines it touches before and after it, as `-` and `+`
 * rows with the changed part marked: the focus of the change when the mutator
 * names one and the replacement amounts to it, else the whole range, with a
 * space where its replacement would merge with the text next to it (see
 * `separateReplacement`). Every row loses the indentation of the first line, a
 * long line keeps only the text near the change, and a side of many lines keeps
 * its first six and its last one.
 *
 * @param source - Text of the file.
 * @param lineStarts - Offset where each line of the file starts.
 * @param change - Range, replacement and focus of the change.
 * @returns HTML of the rows.
 */
export function renderDiff(
  source: string,
  lineStarts: readonly number[],
  change: ShownChange,
): string {
  let shown = separateReplacement(source, change)
  let { focus } = change
  let [start, end, replacement] =
    (
      focus &&
      shown ===
        `${source.slice(change.start, focus.start)}${focus.replacement}${source.slice(focus.end, change.end)}`
    ) ?
      [focus.start, focus.end, focus.replacement]
    : [change.start, change.end, shown]
  let lineStart = lineStarts.findLast(offset => offset <= change.start)!
  let lineEnd = getLineEnd(
    source,
    lineStarts,
    getSourcePosition(lineStarts, Math.max(change.end - 1, change.start)).line,
  )
  let indent = /^[\t ]*/u.exec(source.slice(lineStart, start))![0].length
  let head = dedent(cutHead(source.slice(lineStart + indent, start)), indent)
  let tail = dedent(cutTail(source.slice(end, lineEnd)), indent)
  let removed = dedent(source.slice(start, end), indent)
  let added = dedent(replacement, indent)
  return `${renderSide('-', 'removed', [{ text: head }, { text: removed, changed: true }, { text: tail }])}${renderSide('+', 'added', [{ text: head }, { changed: true, text: added }, { text: tail }])}`
}

/**
 * Renders one side of a diff.
 *
 * @param sign - `-` or `+`.
 * @param className - Class of its rows.
 * @param pieces - Unchanged head, changed part and unchanged tail.
 * @returns HTML of its rows.
 */
function renderSide(sign: string, className: string, pieces: Piece[]): string {
  let rows: Piece[][] = [[]]
  for (let piece of pieces) {
    for (let [index, part] of piece.text.split(LINE_TERMINATOR).entries()) {
      if (index > 0) {
        rows.push([])
      }
      if (part !== '') {
        rows.at(-1)!.push({ ...piece, text: part })
      }
    }
  }
  if (rows.length > MAX_ROWS) {
    rows = [
      ...rows.slice(0, MAX_ROWS - 2),
      [{ text: `… ${rows.length - MAX_ROWS + 1} more lines`, cut: true }],
      rows.at(-1)!,
    ]
  }
  return rows
    .map(
      row =>
        `<div class="${className}"><span class="sign">${sign}</span> ${row.map(renderPiece).join('')}</div>`,
    )
    .join('')
}

/**
 * Removes indentation from every line of a text but the first, which goes on
 * the row before it.
 *
 * @param text - Part of a side of the diff.
 * @param width - Most spaces and tabs to remove from a line.
 * @returns Text without them.
 */
function dedent(text: string, width: number): string {
  return text
    .split(LINE_TERMINATOR)
    .map((line, index) =>
      index === 0 ? line : (
        line.replace(/^[\t ]+/u, found => found.slice(width))
      ),
    )
    .join('\n')
}

/**
 * Keeps the end of a long last line of the text before a change.
 *
 * @param text - Text before the change.
 * @returns Text with an ellipsis in place of the cut part.
 */
function cutHead(text: string): string {
  let lines = text.split(LINE_TERMINATOR)
  let last = lines.at(-1)!
  if (last.length > HEAD_ROOM) {
    lines[lines.length - 1] = `…${last.slice(1 - HEAD_ROOM)}`
  }
  return lines.join('\n')
}

/**
 * Renders a part of a row.
 *
 * @param piece - Part of a row.
 * @returns HTML of the part.
 */
function renderPiece(piece: Piece): string {
  let text = escapeHtml(piece.text)
  if (piece.cut) {
    return `<span class="cut">${text}</span>`
  }
  return piece.changed ? `<span class="changed">${text}</span>` : text
}

/**
 * Keeps the start of a long first line of the text after a change.
 *
 * @param text - Text after the change.
 * @returns Text with an ellipsis in place of the cut part.
 */
function cutTail(text: string): string {
  let lines = text.split(LINE_TERMINATOR)
  if (lines[0]!.length > TAIL_ROOM) {
    lines[0] = `${lines[0]!.slice(0, TAIL_ROOM - 1)}…`
  }
  return lines.join('\n')
}
