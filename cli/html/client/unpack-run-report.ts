import type {
  RunReportMutant,
  RunReportTest,
  RunReport,
} from '../../../types/report/run-report'
import type {
  HtmlReportMutant,
  HtmlReport,
} from '../../../types/report/html-report'
import type { ListReportSkipped } from '../../../types/report/list-report-skipped'
import type { ListReportFocus } from '../../../types/report/list-report-focus'

import { getSourcePosition } from '../../../core/text/get-source-position'
import { getLineStarts } from '../../../core/text/get-line-starts'
import { unpackReplacement } from './unpack-replacement'
import { getDiffLines } from '../../diff/get-diff-lines'

/**
 * Rebuilds the run report the data of the HTML report was packed from, as
 * `mootant run --json --verbose --all` prints it, with the skipped candidates.
 * Positions, original texts and diff lines come from the sources the way the
 * run report computes them.
 *
 * @param report - Data of the HTML report.
 * @returns Run report with every mutant and the skipped candidates.
 */
export function unpackRunReport(report: HtmlReport): RunReport {
  let { testFiles, mutators, texts, meta } = report
  let files = report.files.map(file => {
    let source = file.source ?? ''
    return { lineStarts: getLineStarts(source), path: file.file, source }
  })
  let tests = report.tests.map((test): RunReportTest => ({
    file: testFiles[test.file]!,
    name: test.name,
    line: test.line,
  }))
  let counts = report.files.map(() => 0)
  let mutants = report.mutants.map((mutant): RunReportMutant => {
    let { lineStarts, source, path } = files[mutant.file]!
    let original = source.slice(mutant.start, mutant.end)
    let replacement = unpackReplacement(original, mutant)
    let start = getSourcePosition(lineStarts, mutant.start)
    let end = getSourcePosition(lineStarts, mutant.end)
    let decided = mutant.status === 'Killed' || mutant.status === 'Timeout'
    let coveredBy =
      decided ? null : mutant.coveredBy!.map(index => tests[index]!)
    let killedBy =
      mutant.killedBy === undefined ? null : tests[mutant.killedBy]!
    counts[mutant.file]! += 1
    return {
      ...getDiffLines(source, lineStarts, {
        start: mutant.start,
        end: mutant.end,
        replacement,
      }),
      ...unpackFocus(mutant.focus, source, lineStarts),
      testFiles:
        decided ? null : (
          Object.fromEntries(
            mutant.testFiles!.map(([file, count]) => [testFiles[file]!, count]),
          )
        ),
      killedIn:
        mutant.killedIn === undefined ?
          (killedBy?.file ?? null)
        : testFiles[mutant.killedIn]!,
      recheck:
        mutant.status === 'Ignored' ?
          null
        : `${meta.recheck} --mutant ${mutant.id}`,
      message: mutant.message === undefined ? null : texts[mutant.message]!,
      reason: mutant.reason === undefined ? null : texts[mutant.reason]!,
      scope: mutant.scope === undefined ? null : texts[mutant.scope]!,
      isolatedBecause: mutant.isolatedBecause ?? null,
      mutator: mutators[mutant.mutator]!.id,
      ignoredBy: mutant.ignoredBy ?? null,
      kind: mutant.kind ?? 'expression',
      tests: coveredBy?.length ?? null,
      cached: mutant.cached ?? false,
      test: coveredBy?.[0] ?? null,
      cause: mutant.cause ?? null,
      duration: mutant.duration,
      path: mutant.path ?? null,
      endColumn: end.column,
      status: mutant.status,
      column: start.column,
      start: mutant.start,
      endLine: end.line,
      line: start.line,
      end: mutant.end,
      id: mutant.id,
      replacement,
      file: path,
      coveredBy,
      original,
      killedBy,
    }
  })
  let skipped = report.skipped.map((entry): ListReportSkipped => {
    let { lineStarts, source, path } = files[entry.file]!
    let original = source.slice(entry.start, entry.end)
    let position = getSourcePosition(lineStarts, entry.start)
    return {
      by:
        entry.by ?
          {
            mutator: entry.by.mutator,
            column: entry.by.column,
            line: entry.by.line,
            id: entry.by.id,
          }
        : null,
      ...unpackFocus(entry.focus, source, lineStarts),
      replacement: unpackReplacement(original, entry),
      mutator: mutators[entry.mutator]!.id,
      heuristic: entry.heuristic ?? false,
      reason: texts[entry.reason]!,
      category: entry.category,
      column: position.column,
      line: position.line,
      start: entry.start,
      rule: entry.rule,
      end: entry.end,
      file: path,
      original,
    }
  })
  return {
    files: report.files.map((file, index) => ({
      mutants: counts[index]!,
      parsed: file.parsed,
      file: file.file,
    })),
    runnerVersion: meta.runnerVersion,
    diagnostics: report.diagnostics,
    summary: report.summary,
    runner: meta.runner,
    preset: meta.preset,
    since: meta.since,
    schemaVersion: 3,
    mode: meta.mode,
    command: 'run',
    listed: 'all',
    mutators,
    skipped,
    mutants,
  }
}

/**
 * Rebuilds the focus of a change with its original text and position, as the
 * list report adds it.
 *
 * @param focus - Focus as stored, if any.
 * @param source - Text of the file.
 * @param lineStarts - Offset where each line of the file starts.
 * @returns Object to spread into the entry: with `focus`, or empty.
 */
function unpackFocus(
  focus: HtmlReportMutant['focus'],
  source: string,
  lineStarts: readonly number[],
): { focus?: ListReportFocus } {
  if (!focus) {
    return {}
  }
  let position = getSourcePosition(lineStarts, focus.start)
  return {
    focus: {
      original: source.slice(focus.start, focus.end),
      replacement: focus.replacement,
      column: position.column,
      line: position.line,
      start: focus.start,
      end: focus.end,
    },
  }
}
