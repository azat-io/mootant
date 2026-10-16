import type { Diagnostic } from '../../types/mutant/diagnostic'
import type { TextStyle } from '../../types/cli/text-style'

import { getSymbols } from '../terminal/get-symbols'

/**
 * Prints diagnostics to stderr as one compact block in text mode, followed by
 * an empty line: one line each, errors with a red mark and `console.error`,
 * warnings with a yellow mark and `console.warn`.
 *
 * @param diagnostics - Sorted problems of the run.
 * @param style - Colors and symbols of the output.
 */
export function printDiagnostics(
  diagnostics: readonly Diagnostic[],
  style: TextStyle,
): void {
  if (diagnostics.length === 0) {
    return
  }
  let { colors } = style
  let { warning, cross } = getSymbols(style.unicode)
  for (let diagnostic of diagnostics) {
    let { severity, message, column, line, file, code } = diagnostic
    let where =
      file === null ? '' : (
        `${[file, line, column].filter(part => part !== null).join(':')}: `
      )
    let text = `${where}${message} ${colors.gray(`[${code}]`)}`
    if (severity === 'error') {
      console.error(`${colors.red(cross)} ${text}`)
    } else {
      console.warn(`${colors.yellow(warning)} ${text}`)
    }
  }
  console.warn('')
}
