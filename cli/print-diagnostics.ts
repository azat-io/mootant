import type { Diagnostic } from '../types/mutant/diagnostic'

/**
 * Prints diagnostics to stderr, one line each, in text mode: errors with
 * `console.error`, the others with `console.warn`.
 *
 * @param diagnostics - Sorted problems of the run.
 */
export function printDiagnostics(diagnostics: readonly Diagnostic[]): void {
  for (let diagnostic of diagnostics) {
    let line = formatDiagnostic(diagnostic)
    if (diagnostic.severity === 'error') {
      console.error(line)
    } else {
      console.warn(line)
    }
  }
}

/**
 * Formats a diagnostic as `file:line:column: severity: message [code]`, leaving
 * out a missing line or column.
 *
 * @param diagnostic - Problem to format.
 * @returns One line of text.
 */
function formatDiagnostic(diagnostic: Diagnostic): string {
  let { severity, message, column, line, file, code } = diagnostic
  let where = ''
  if (file !== null) {
    where = `${[file, line, column].filter(part => part !== null).join(':')}: `
  }
  return `${where}${severity}: ${message} [${code}]`
}
