import type { ListOptions } from './parse-arguments'

import { printDiagnostics } from './report/print-diagnostics'
import { buildListReport } from './report/build-list-report'
import { getTextStyle } from './terminal/get-text-style'
import { formatCommand } from './report/format-command'
import { formatReport } from './report/format-report'
import { listMutants } from '../core/list-mutants'

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
      since: options.since,
      paths: options.paths,
      cwd: process.cwd(),
    })
    let report = buildListReport(result)
    if (!options.json) {
      printDiagnostics(report.diagnostics, getTextStyle(process.stderr))
    }
    console.info(
      formatReport(report, options.json ? 'json' : 'text', {
        command: formatCommand('list', options),
        style: getTextStyle(process.stdout),
      }),
    )
    if (report.summary.totalErrors > 0) {
      process.exitCode = 1
    }
  } catch (error) {
    let { colors } = getTextStyle(process.stderr)
    console.error(`${colors.red('Error:')} ${(error as Error).message}`)
    process.exitCode = 1
  }
}
