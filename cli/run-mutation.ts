import type { RunOptions } from './parse-arguments'

import { getShortIdLength } from './report/get-short-id-length'
import { printDiagnostics } from './report/print-diagnostics'
import { formatRunReport } from './report/format-run-report'
import { buildRunReport } from './report/build-run-report'
import { createRunProgress } from './create-run-progress'
import { getBuiltInAdapters } from './built-in-adapters'
import { getTextStyle } from './terminal/get-text-style'
import { formatCommand } from './report/format-command'
import { runMutants } from '../core/run-mutants'

/**
 * Runs the run command and prints its report. Live progress goes to stderr and
 * is erased before the report, so stdout holds only the report, pure JSON with
 * `--json`. What the tests write is shown with `--verbose`, else only when the
 * run fails. Never rejects: the exit code is 1 when the run does not pass (an
 * error diagnostic, a mutant without a verdict, a score below the threshold) or
 * fails, so piped output is never cut. Re-check commands leave `--since` out:
 * `--mutant` already pins the mutant, which the changed lines may no longer
 * hold after a commit or a rebase.
 *
 * @param options - Options of the run command.
 */
export async function runMutation(options: RunOptions): Promise<void> {
  let errorStyle = getTextStyle(process.stderr)
  let progress = createRunProgress(errorStyle, options.verbose)
  try {
    let result = await runMutants({
      ...(options.concurrency !== undefined && {
        concurrency: options.concurrency,
      }),
      ...(options.threshold !== undefined && { threshold: options.threshold }),
      ...(options.fast !== undefined && { fast: options.fast }),
      ...(options.cache !== undefined && { cache: options.cache }),
      ...(options.config !== undefined && { config: options.config }),
      ...(options.preset !== undefined && { preset: options.preset }),
      ...(options.since !== undefined && { since: options.since }),
      onProgress: event => {
        progress.handle(event)
      },
      builtIns: getBuiltInAdapters(),
      mutantIds: options.mutantIds,
      paths: options.paths,
      cwd: process.cwd(),
    })
    progress.finish()
    let recheck = formatCommand('run', {
      ...(options.config !== undefined && { config: options.config }),
      ...(options.preset !== undefined && { preset: options.preset }),
      ...(options.fast !== undefined && { fast: options.fast }),
      paths: options.paths,
    })
    let report = buildRunReport(result, { all: options.all, recheck })
    if (!options.json) {
      printDiagnostics(report.diagnostics, errorStyle)
    }
    console.info(
      formatRunReport(report, options.json ? 'json' : 'text', {
        idLength: getShortIdLength(result.listedIds),
        command: formatCommand('run', options),
        style: getTextStyle(process.stdout),
        verbose: options.verbose,
        recheck,
      }),
    )
    if (!report.summary.passed) {
      process.exitCode = 1
    }
  } catch (error) {
    progress.finish()
    let output = progress.output()
    let { colors } = errorStyle
    if (output.trim() !== '') {
      console.error(
        `${colors.gray('Output of the tests:')}\n${output.replace(/\n$/u, '')}\n`,
      )
    }
    console.error(`${colors.red('Error:')} ${(error as Error).message}`)
    process.exitCode = 1
  }
}
