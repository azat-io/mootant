import type { ListOptions } from './parse-arguments'

import { printDiagnostics } from './print-diagnostics'
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
      skipped: options.skipped,
      config: options.config,
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
