import type { RunOptions } from './parse-arguments'

import { getBuiltInAdapters } from './built-in-adapters'
import { printDiagnostics } from './print-diagnostics'
import { formatRunReport } from './format-run-report'
import { buildRunReport } from './build-run-report'
import { runMutants } from '../core/run-mutants'

/**
 * Runs the run command and prints its report. Notes of the run go to stderr as
 * it goes on. Never rejects: the exit code is 1 when the run does not pass (an
 * error diagnostic, a mutant without a verdict, a score below the threshold) or
 * fails, so piped output is never cut.
 *
 * @param options - Options of the run command.
 */
export async function runMutation(options: RunOptions): Promise<void> {
  try {
    let result = await runMutants({
      ...(options.concurrency !== undefined && {
        concurrency: options.concurrency,
      }),
      ...(options.threshold !== undefined && { threshold: options.threshold }),
      ...(options.fast !== undefined && { fast: options.fast }),
      ...(options.config !== undefined && { config: options.config }),
      ...(options.preset !== undefined && { preset: options.preset }),
      onProgress: message => {
        console.warn(message)
      },
      builtIns: getBuiltInAdapters(),
      mutantIds: options.mutantIds,
      paths: options.paths,
      cwd: process.cwd(),
    })
    let report = buildRunReport(result)
    console.info(formatRunReport(report, options.json ? 'json' : 'text'))
    if (!options.json) {
      printDiagnostics(report.diagnostics)
    }
    if (!report.summary.passed) {
      process.exitCode = 1
    }
  } catch (error) {
    console.error('\nError:', (error as Error).message)
    process.exitCode = 1
  }
}
