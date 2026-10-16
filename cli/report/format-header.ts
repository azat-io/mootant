import type { TextStyle } from '../../types/cli/text-style'

import { getDisplayWidth } from '../terminal/get-display-width'
import { cutToWidth } from '../terminal/cut-to-width'
import { getSymbols } from '../terminal/get-symbols'

/**
 * Fewest columns the header spans, so a short report still sets the note apart.
 */
const MIN_WIDTH = 60

/**
 * Most columns the header spans when the body is wider, so the note stays near
 * the rows on a wide terminal or in a file.
 */
const MAX_WIDTH = 100

/**
 * Formats the first line of a text report: a mark and the command on the left,
 * a note such as the test runner on the right, ending where the widest line of
 * the body ends, within 60 to 100 columns and the width of the output. The
 * command is cut when wider than the output; the note is left out when it does
 * not fit next to the command.
 *
 * @param title - Command and note of the header.
 * @param title.command - Command as typed, such as `mootant run src --fast`.
 * @param title.note - Text on the right, such as `vitest 5.0.4`.
 * @param body - The rest of the report, which the note lines up with.
 * @param style - Colors, width and symbols of the output.
 * @returns One line.
 */
export function formatHeader(
  title: { command: string; note: string },
  body: string,
  style: TextStyle,
): string {
  let { command, note } = title
  let { colors } = style
  let { ellipsis, dot } = getSymbols(style.unicode)
  let shown = cutToWidth(command, {
    width: style.width - getDisplayWidth(`${dot} `),
    ellipsis,
  })
  let line = `${colors.greenBright(dot)} ${colors.bold(shown)}`
  let widest = body
    .split('\n')
    .reduce(
      (widestLine, bodyLine) => Math.max(widestLine, getDisplayWidth(bodyLine)),
      0,
    )
  let needed = getDisplayWidth(`${dot} ${shown}  ${note}`)
  let width = Math.min(
    style.width,
    Math.max(needed, MIN_WIDTH, Math.min(MAX_WIDTH, widest)),
  )
  if (needed > width) {
    return line
  }
  return `${line}${' '.repeat(width - needed + 2)}${colors.gray(note)}`
}
