import type { Diagnostic } from '../types/diagnostic'
import type { ListOptions } from './parse-arguments'

import { buildListReport } from './build-list-report'
import { listMutants } from '../core/list-mutants'
import { formatReport } from './format-report'

/**
 * Runs the list command and prints its report. Never rejects: failures set the
 * exit code, so piped output is never cut.
 *
 * @param options - Options of the list command.
 */
export async function runList(options: ListOptions): Promise<void> {
  try {
    let result = await listMutants({
      preset: options.preset,
      paths: options.paths,
      cwd: process.cwd(),
    })
    let report = buildListReport(result)
    console.info(formatReport(report, options.json ? 'json' : 'text'))
    if (!options.json) {
      printDiagnostics(report.diagnostics)
    }
    if (report.summary.totalErrors > 0) {
      process.exitCode = 1
    }
  } catch (error) {
    console.error('\nError:', (error as Error).message)
    process.exitCode = 1
  }
}

/**
 * Formats a diagnostic as `file:line:column: severity: message [code]`.
 *
 * @param diagnostic - Problem to format.
 * @returns One line of text.
 */
function formatDiagnostic(diagnostic: Diagnostic): string {
  let { severity, message, column, line, file, code } = diagnostic
  let where = ''
  if (file !== null) {
    where = line === null ? `${file}: ` : `${file}:${line}:${column}: `
  }
  return `${where}${severity}: ${message} [${code}]`
}

/**
 * Prints diagnostics to stderr, one line each, in text mode.
 *
 * @param diagnostics - Sorted problems of the run.
 */
function printDiagnostics(diagnostics: Diagnostic[]): void {
  for (let diagnostic of diagnostics) {
    let line = formatDiagnostic(diagnostic)
    if (diagnostic.severity === 'error') {
      console.error(line)
    } else {
      console.warn(line)
    }
  }
}
