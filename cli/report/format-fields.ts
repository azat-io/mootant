import type { TextStyle } from '../../types/cli/text-style'

import { getDisplayWidth } from '../terminal/get-display-width'
import { cutToWidth } from '../terminal/cut-to-width'
import { getSymbols } from '../terminal/get-symbols'
import { stripAnsi } from '../terminal/strip-ansi'

/**
 * Width of the label column.
 */
const LABEL_WIDTH = 16

/**
 * Fewest columns a value keeps however narrow the output is.
 */
const MIN_VALUE_WIDTH = 12

/**
 * Formats labeled values, one per line, with the values in one column: gray
 * labels, values as given. A value wider than the rest of the line is cut, and
 * then loses its colors.
 *
 * @param fields - Label and value pairs; the value may carry colors.
 * @param style - Colors, width and symbols of the output.
 * @returns Lines joined with line breaks.
 */
export function formatFields(
  fields: readonly [label: string, value: string][],
  style: TextStyle,
): string {
  let { ellipsis } = getSymbols(style.unicode)
  let room = Math.max(MIN_VALUE_WIDTH, style.width - LABEL_WIDTH)
  return fields
    .map(([label, value]) => {
      let shown =
        getDisplayWidth(value) <= room ? value : (
          cutToWidth(stripAnsi(value), { width: room, ellipsis })
        )
      return `${style.colors.gray(label.padEnd(LABEL_WIDTH))}${shown}`
    })
    .join('\n')
}
