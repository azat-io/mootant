import path from 'node:path'

import type { RunResult } from '../types/run/run-result'
import type { TextStyle } from '../types/cli/text-style'
import type { RunOptions } from './parse-arguments'

import { getShortIdLength } from './report/get-short-id-length'
import { printDiagnostics } from './report/print-diagnostics'
import { formatRunReport } from './report/format-run-report'
import { buildHtmlReport } from './html/build-html-report'
import { writeHtmlReport } from './html/write-html-report'
import { readProjectName } from './html/read-project-name'
import { buildRunReport } from './report/build-run-report'
import { createRunProgress } from './create-run-progress'
import { getFileScores } from './report/get-file-scores'
import { getBuiltInAdapters } from './built-in-adapters'
import { getTextStyle } from './terminal/get-text-style'
import { formatCommand } from './report/format-command'
import { runMutants } from '../core/run-mutants'
import { version } from '../package.json'

/**
 * Runs the run command and prints its report. Live progress goes to stderr and
 * is erased before the report, so stdout holds only the report, pure JSON with
 * `--json`. What the tests write is shown with `--verbose`, else only when the
 * run fails. Never rejects: the exit code is 1 when the run does not pass (an
 * error diagnostic, a mutant without a verdict, a score below the threshold) or
 * fails, so piped output is never cut. Re-check commands leave `--since` out:
 * `--mutant` already pins the mutant, which the changed lines may no longer
 * hold after a commit or a rebase. `--json` prints the slim report, `--json
 * --verbose` the full one. A terminal also gets the files with the lowest
 * scores. When the run asks for an HTML report, it is written after the report
 * is printed and its path goes to stderr; a report that cannot be written is an
 * error.
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
      ...(options.incremental !== undefined && {
        incremental: options.incremental,
      }),
      ...(options.fast !== undefined && { fast: options.fast }),
      ...(options.html !== undefined && { html: options.html }),
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
      ...(options.incremental !== undefined && {
        incremental: options.incremental,
      }),
      ...(options.fast !== undefined && { fast: options.fast }),
      paths: options.paths,
    })
    let report = buildRunReport(result, { all: options.all, recheck })
    if (!options.json) {
      printDiagnostics(report.diagnostics, errorStyle)
    }
    console.info(
      formatRunReport(report, options.json ? 'json' : 'text', {
        ...(!options.json &&
          process.stdout.isTTY && { files: getFileScores(result) }),
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
    if (result.html !== null) {
      await saveHtmlReport(result, result.html, {
        command: `${formatCommand('run', options)}${options.html ? ' --html' : ''}`,
        style: errorStyle,
        recheck,
      })
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

/**
 * Writes the HTML report of a run and prints its path, relative to the working
 * directory, to stderr; a report that cannot be written is printed as an error
 * and fails the command. The page template, with the fonts, styles and client
 * it embeds, loads only here, so a run without an HTML report never reads it.
 *
 * @param result - Outcome of the run.
 * @param file - Absolute path of the report.
 * @param options - Command lines of the run and of a re-check, and the style of
 *   stderr.
 * @param options.command - Command line of the run.
 * @param options.recheck - Command line before `--mutant`.
 * @param options.style - Colors of stderr.
 */
async function saveHtmlReport(
  result: RunResult,
  file: string,
  options: { style: TextStyle; recheck: string; command: string },
): Promise<void> {
  let { colors } = options.style
  let now = new Date()
  try {
    let report = buildHtmlReport(result, {
      idLength: getShortIdLength(result.listedIds),
      project: readProjectName(result.root),
      recheck: options.recheck,
      command: options.command,
      date: now.toISOString(),
      version,
    })
    let { formatHtmlReport } = await import('./html/format-html-report')
    await writeHtmlReport(file, formatHtmlReport(report))
    console.error(
      `${colors.gray('html report:')} ${path.relative(process.cwd(), file)}`,
    )
  } catch (error) {
    console.error(
      `${colors.red('Error:')} The HTML report could not be written to ${file}: ${(error as Error).message}`,
    )
    process.exitCode = 1
  }
}
