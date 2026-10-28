import type { ListReportFocus } from '../../types/report/list-report-focus'
import type { ListReportDiff } from '../../types/report/list-report-diff'
import type { TextStyle } from '../../types/cli/text-style'

import { getMaxDisplayWidth } from '../terminal/get-max-display-width'
import { getDisplayWidth } from '../terminal/get-display-width'
import { formatByFile } from '../terminal/format-by-file'
import { padToWidth } from '../terminal/pad-to-width'
import { cutToWidth } from '../terminal/cut-to-width'
import { getSymbols } from '../terminal/get-symbols'
import { formatDiff } from './format-diff'
import { markDiff } from './mark-diff'

/**
 * Mutant of a report printed as a diff, with what goes under it.
 */
export interface DiffEntry {
  /**
   * Mutant with its position and source lines.
   */
  mutant: {
    focus?: ListReportFocus
    endColumn: number
    mutator: string
    column: number
    file: string
    line: number
  } & ListReportDiff

  /**
   * Lines under the diff without indentation: a text, such as the reason of an
   * error, cut at its end when too wide, or a label and a path, such as `test:
   * ` and a test file, whose path is cut at its start, so the file name stays.
   */
  details: ({ label: string; path: string } | string)[]

  /**
   * Id as printed, cut to the length that tells mutants apart.
   */
  id: string
}

/**
 * Space between two columns of a heading.
 */
const GAP = '  '

/**
 * Indentation of the heading of a mutant under its file.
 */
const INDENT = '  '

/**
 * Indentation of the diff and the details under the heading.
 */
const BODY_INDENT = ' '.repeat(4)

/**
 * Most columns of a diff line with its indentation, even when the output has no
 * width, such as a file, so a long line such as a minified one does not fill
 * the report.
 */
const MAX_DIFF_WIDTH = 160

/**
 * Fewest columns a mutator id or a diff line keeps however narrow the output
 * is.
 */
const MIN_WIDTH = 8

/**
 * Formats mutants grouped by file, each as a diff: the path in bold, cut from
 * its start when wider than the line, then for each mutant a heading with the
 * `line:column` of the change, the mutator and the id, columns aligned within
 * the file, the source lines before and after the mutant under it (see
 * `formatDiff`), at most 160 columns wide, and the detail lines in gray, cut to
 * the width, a path from its start. Mutants are separated by an empty line;
 * files keep the order their first mutant has.
 *
 * @param entries - Mutants in the order to print.
 * @param style - Colors, width and symbols of the output.
 * @returns Groups separated by an empty line, or an empty text without entries.
 */
export function formatDiffGroups(
  entries: readonly DiffEntry[],
  style: TextStyle,
): string {
  return formatByFile(entries, {
    formatGroup: group => formatGroup(group, style),
    getFile: entry => entry.mutant.file,
    style,
  })
}

/**
 * Formats the mutants of one file.
 *
 * @param entries - Mutants of the file.
 * @param style - Colors, width and symbols of the output.
 * @returns Lines of the group without its heading.
 */
function formatGroup(entries: readonly DiffEntry[], style: TextStyle): string {
  let { colors, width } = style
  let { ellipsis } = getSymbols(style.unicode)
  let locations = entries.map(entry => {
    let position = entry.mutant.focus ?? entry.mutant
    return `${position.line}:${position.column}`
  })
  let locationWidth = getMaxDisplayWidth(locations)
  let idWidth = getMaxDisplayWidth(entries.map(entry => entry.id))
  let mutatorWidth = Math.min(
    getMaxDisplayWidth(entries.map(entry => entry.mutant.mutator)),
    Math.max(
      MIN_WIDTH,
      width - INDENT.length - locationWidth - GAP.length * 2 - idWidth,
    ),
  )
  let bodyWidth = Math.max(MIN_WIDTH, width - BODY_INDENT.length)
  let diffStyle = {
    ...style,
    width: Math.min(bodyWidth, MAX_DIFF_WIDTH - BODY_INDENT.length),
  }
  return entries
    .map((entry, index) => {
      let mutator = cutToWidth(entry.mutant.mutator, {
        width: mutatorWidth,
        ellipsis,
      })
      let heading = [
        `${INDENT}${colors.gray(padToWidth(locations[index]!, locationWidth))}`,
        colors.gray(padToWidth(mutator, mutatorWidth)),
        entry.id,
      ].join(GAP)
      return [
        heading,
        ...formatDiff(markDiff(entry.mutant), diffStyle),
        ...entry.details.map(detail =>
          colors.gray(
            typeof detail === 'string' ?
              cutToWidth(detail, { width: bodyWidth, ellipsis })
            : `${detail.label}${cutToWidth(detail.path, {
                width: Math.max(
                  MIN_WIDTH,
                  bodyWidth - getDisplayWidth(detail.label),
                ),
                side: 'start',
                ellipsis,
              })}`,
          ),
        ),
      ]
        .map((line, lineIndex) =>
          lineIndex === 0 ? line : `${BODY_INDENT}${line}`,
        )
        .join('\n')
    })
    .join('\n\n')
}
