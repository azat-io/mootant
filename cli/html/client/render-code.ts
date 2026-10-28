import type { IndexedMutant } from '../../../types/html/indexed-mutant'
import type { IndexedFile } from '../../../types/html/indexed-file'
import type { RunStatus } from '../../../types/run/run-status'

import { describeStatus } from './describe-status'
import { getLineEnd } from './get-line-end'
import { escapeHtml } from './escape-html'

/**
 * What the code of a file shows.
 */
interface CodeOptions {
  /**
   * Mutants of the file that the filter shows, for the badges of the lines.
   */
  visible: readonly IndexedMutant[]

  /**
   * Every mutant of the report, by index.
   */
  mutants: readonly IndexedMutant[]

  /**
   * Mutant whose range is marked as selected, or null.
   */
  selected: IndexedMutant | null

  /**
   * Skipped candidate each code unit shows (`paintRanges` over the skipped
   * candidates of the file), or null when they are hidden.
   */
  skipped: Int32Array | null

  /**
   * Mutant each code unit shows (`paintRanges` over the highlighted mutants),
   * by index.
   */
  painted: Int32Array

  /**
   * Kind of each code unit (`tokenizeSource`).
   */
  tokens: Uint8Array

  /**
   * File to show.
   */
  file: IndexedFile
}

/**
 * Classes of the token kinds of `tokenizeSource`: strings and numbers stay
 * plain, they are only told apart so that what is inside them stays plain too.
 */
const TOKEN_CLASSES = ['', 'token-keyword', 'token-comment', '', '']

/**
 * Statuses that get a badge of their own on a line, in badge order; killed and
 * timed-out mutants share one.
 */
const BADGES: [status: RunStatus, statuses: RunStatus[]][] = [
  ['Survived', ['Survived']],
  ['NoCoverage', ['NoCoverage']],
  ['Error', ['Error']],
  ['Killed', ['Killed', 'Timeout']],
  ['Ignored', ['Ignored']],
]

/**
 * Renders the code of a file line by line: the line number, a badge with the
 * number of shown mutants of each status that start on the line, and the text,
 * quietly highlighted, with the range of each highlighted mutant marked by the
 * status of the mutant it shows, the skipped candidates when shown, and the
 * selected mutant. The lines are built without the `html` tag: the white space
 * of their text shows.
 *
 * @param options - File, highlighting and selection.
 * @returns HTML of the lines.
 */
export function renderCode(options: CodeOptions): string {
  let { selected, skipped, file } = options
  let { lineStarts, source } = file
  let starts = new Map<number, IndexedMutant[]>()
  for (let mutant of options.visible) {
    starts.set(mutant.line, [...(starts.get(mutant.line) ?? []), mutant])
  }
  let skippedStarts = new Map<number, number>()
  if (skipped) {
    for (let entry of file.skipped) {
      skippedStarts.set(entry.line, (skippedStarts.get(entry.line) ?? 0) + 1)
    }
  }
  let lines: string[] = []
  for (let [index, lineStart] of lineStarts.entries()) {
    let line = index + 1
    let text = renderLineText(
      options,
      lineStart,
      getLineEnd(source, lineStarts, line),
    )
    let badges = renderBadges(
      line,
      starts.get(line) ?? [],
      skippedStarts.get(line),
    )
    let active =
      selected !== null && line >= selected.line && line <= selected.endLine
    lines.push(
      [
        `<div class="line${active ? ' is-active' : ''}" id="L${line}">`,
        `<span class="line-number">${line}</span>`,
        `<span class="line-badges">${badges}</span>`,
        `<span class="line-code">${text || ' '}</span>`,
        '</div>',
      ].join(''),
    )
  }
  return lines.join('')
}

/**
 * Renders a run of code units that look the same.
 *
 * @param options - File, highlighting and selection.
 * @param start - Offset of the first code unit of the run.
 * @param end - Offset just past the run.
 * @returns HTML of the run.
 */
function renderRun(options: CodeOptions, start: number, end: number): string {
  let { selected, mutants, skipped, painted, tokens, file } = options
  let classes = [TOKEN_CLASSES[tokens[start]!]!]
  let attributes = ''
  let mutant = mutants[painted[start]!]
  let skip = skipped?.[start] ?? -1
  if (mutant) {
    classes.push('range', `range-${describeStatus(mutant.status).key}`)
    attributes = ` data-mutant="${mutant.index}"`
  } else if (skip !== -1) {
    classes.push('range', 'range-skipped')
    attributes = ` data-skip="${skip}"`
  }
  if (isSelected(start, selected)) {
    classes.push(
      'is-selected',
      `selected-${describeStatus(selected!.status).key}`,
    )
  }
  let text = escapeHtml(file.source.slice(start, end))
  let className = classes.filter(Boolean).join(' ')
  return className === '' ? text : (
      `<span class="${className}"${attributes}>${text}</span>`
    )
}

/**
 * Renders the badges of a line: one with the number of shown mutants of each
 * status that start on the line, then one with the number of skipped
 * candidates.
 *
 * @param line - 1-based line.
 * @param mutants - Shown mutants that start on the line.
 * @param skippedCount - Skipped candidates that start on the line, when they
 *   are shown.
 * @returns HTML of the badges.
 */
function renderBadges(
  line: number,
  mutants: readonly IndexedMutant[],
  skippedCount: undefined | number,
): string {
  let badges = ''
  for (let [status, statuses] of BADGES) {
    let count = mutants.filter(mutant =>
      statuses.includes(mutant.status),
    ).length
    if (count > 0) {
      let { label, key } = describeStatus(status)
      badges += [
        `<button class="tally status-${key}" type="button"`,
        ` data-line="${line}" data-status="${status}"`,
        ` aria-label="${count} ${label} on line ${line}">${count}</button>`,
      ].join('')
    }
  }
  if (skippedCount) {
    badges += [
      `<button class="tally status-skipped" type="button"`,
      ` data-line-skip="${line}"`,
      ` aria-label="${skippedCount} skipped on line ${line}, show the next">`,
      `${skippedCount}</button>`,
    ].join('')
  }
  return badges
}

/**
 * Renders the text of a line as runs of code units that look the same.
 *
 * @param options - File, highlighting and selection.
 * @param start - Offset of the first code unit of the line.
 * @param end - Offset just past the last code unit of the text of the line.
 * @returns HTML of the text.
 */
function renderLineText(
  options: CodeOptions,
  start: number,
  end: number,
): string {
  let { selected, skipped, painted, tokens } = options
  let text = ''
  let runStart = start
  for (let offset = start + 1; offset <= end; offset++) {
    if (
      offset === end ||
      tokens[offset] !== tokens[runStart] ||
      painted[offset] !== painted[runStart] ||
      skipped?.[offset] !== skipped?.[runStart] ||
      isSelected(offset, selected) !== isSelected(runStart, selected)
    ) {
      text += renderRun(options, runStart, offset)
      runStart = offset
    }
  }
  return text
}

/**
 * Checks whether a code unit is in the marked range of the selected mutant,
 * where an empty range marks the code unit at its start.
 *
 * @param offset - Offset of the code unit.
 * @param selected - Selected mutant, or null.
 * @returns True inside the range.
 */
function isSelected(offset: number, selected: IndexedMutant | null): boolean {
  return (
    selected !== null &&
    offset >= selected.start &&
    offset < Math.max(selected.end, selected.start + 1)
  )
}
