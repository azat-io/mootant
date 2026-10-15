import type { ListReportSkipped } from '../types/report/list-report-skipped'
import type { ListReportMutant } from '../types/report/list-report-mutant'
import type { SkippedMutant } from '../types/mutant/skipped-mutant'
import type { SkipCategory } from '../types/mutant/skip-category'
import type { ListResult } from '../types/report/list-result'
import type { ListReport } from '../types/report/list-report'
import type { Diagnostic } from '../types/mutant/diagnostic'

import { getSourcePosition } from '../core/text/get-source-position'
import { compareCodeUnits } from '../core/compare-code-units'
import { getLineStarts } from '../core/text/get-line-starts'

/**
 * Line terminator at the end of a line of text: CRLF, CR, LF, U+2028 or U+2029.
 */
const TRAILING_LINE_TERMINATOR_PATTERN = /(?:\r\n|[\n\r\u{2028}\u{2029}])$/u

/**
 * Skip categories in the order the summary counts them.
 */
const SKIP_CATEGORIES: readonly SkipCategory[] = [
  'equivalent',
  'noise',
  'timeout',
  'owned',
  'subsumed',
  'duplicate',
  'invalid',
]

/**
 * Turns the result of a list run into the report that every formatter reads:
 * positions, original fragments, source lines, descriptions, counts and sorted
 * diagnostics. When the run collected skipped candidates, the report lists them
 * with their positions and counts them by category; otherwise it has neither.
 *
 * @param result - Outcome of the list run.
 * @returns Report of the run.
 */
export function buildListReport(result: ListResult): ListReport {
  let descriptions = new Map<string, string>()
  let counts = new Map<string, number>()
  for (let active of result.mutators) {
    descriptions.set(active.id, active.mutator.meta.description)
    counts.set(active.id, 0)
  }

  let mutants: ListReportMutant[] = []
  let skipped: ListReportSkipped[] = []
  let diagnostics = [...result.diagnostics]
  for (let fileMutants of result.files) {
    diagnostics.push(...fileMutants.diagnostics)
    let { source } = fileMutants
    if (source === null) {
      continue
    }
    let lineStarts = getLineStarts(source)
    for (let mutant of fileMutants.mutants) {
      let startPosition = getSourcePosition(lineStarts, mutant.start)
      let endPosition = getSourcePosition(lineStarts, mutant.end)
      counts.set(mutant.mutator, counts.get(mutant.mutator)! + 1)
      mutants.push({
        sourceLine: getSourceLine(source, lineStarts, startPosition.line),
        original: source.slice(mutant.start, mutant.end),
        description: descriptions.get(mutant.mutator)!,
        replacement: mutant.replacement,
        endColumn: endPosition.column,
        column: startPosition.column,
        ignoredBy: mutant.ignoredBy,
        endLine: endPosition.line,
        line: startPosition.line,
        mutator: mutant.mutator,
        status: mutant.status,
        reason: mutant.reason,
        scope: mutant.scope,
        start: mutant.start,
        file: mutant.file,
        kind: mutant.kind,
        end: mutant.end,
        id: mutant.id,
      })
    }
    for (let candidate of fileMutants.skipped) {
      skipped.push(createSkippedEntry(candidate, source, lineStarts))
    }
  }

  let sortedDiagnostics = diagnostics.toSorted(compareDiagnostics)
  let totalPending = 0
  for (let mutant of mutants) {
    if (mutant.status === 'Pending') {
      totalPending += 1
    }
  }
  let totalErrors = 0
  for (let diagnostic of sortedDiagnostics) {
    if (diagnostic.severity === 'error') {
      totalErrors += 1
    }
  }

  let report: ListReport = {
    summary: {
      totalWarnings: sortedDiagnostics.length - totalErrors,
      totalIgnored: mutants.length - totalPending,
      totalFiles: result.files.length,
      totalMutants: mutants.length,
      totalPending,
      totalErrors,
    },
    mutators: result.mutators.map(active => ({
      description: active.mutator.meta.description,
      mutants: counts.get(active.id)!,
      id: active.id,
    })),
    files: result.files.map(fileMutants => ({
      mutants: fileMutants.mutants.length,
      parsed: fileMutants.parsed,
      file: fileMutants.file,
    })),
    diagnostics: sortedDiagnostics,
    preset: result.preset,
    schemaVersion: 1,
    command: 'list',
    mutants,
  }
  if (result.skipped) {
    report.summary.skippedByCategory = countCategories(skipped)
    report.summary.totalSkipped = skipped.length
    report.skipped = skipped
  }
  return report
}

/**
 * Builds the report entry of a skipped candidate.
 *
 * @param candidate - Skipped candidate of a file that was read.
 * @param source - Text of the file as read.
 * @param lineStarts - Line start offsets of the text.
 * @returns The entry with positions and the original fragment.
 */
function createSkippedEntry(
  candidate: SkippedMutant,
  source: string,
  lineStarts: number[],
): ListReportSkipped {
  let { by } = candidate
  let position = getSourcePosition(lineStarts, candidate.start)
  let justifier = by ? getSourcePosition(lineStarts, by.start) : null
  return {
    by:
      by ?
        {
          column: justifier!.column,
          line: justifier!.line,
          mutator: by.mutator,
          id: by.id,
        }
      : null,
    original: source.slice(candidate.start, candidate.end),
    replacement: candidate.replacement,
    heuristic: candidate.heuristic,
    category: candidate.category,
    mutator: candidate.mutator,
    reason: candidate.reason,
    column: position.column,
    start: candidate.start,
    file: candidate.file,
    rule: candidate.rule,
    line: position.line,
    end: candidate.end,
  }
}

/**
 * Orders diagnostics by file, line, column, code and message. A missing file,
 * line or column sorts first.
 *
 * @param left - Diagnostic expected first.
 * @param right - Diagnostic expected second.
 * @returns A negative number when `left` sorts first, a positive number when
 *   `right` sorts first and 0 when both are equal.
 */
function compareDiagnostics(left: Diagnostic, right: Diagnostic): number {
  return (
    compareNullable(left.file, right.file, compareCodeUnits) ||
    compareNullable(left.line, right.line, compareNumbers) ||
    compareNullable(left.column, right.column, compareNumbers) ||
    compareCodeUnits(left.code, right.code) ||
    compareCodeUnits(left.message, right.message)
  )
}

/**
 * Counts skipped candidates by category.
 *
 * @param skipped - Skipped candidates of the run.
 * @returns The count of every category, in summary order.
 */
function countCategories(
  skipped: readonly ListReportSkipped[],
): Record<SkipCategory, number> {
  let counts = Object.fromEntries(
    SKIP_CATEGORIES.map(category => [category, 0]),
  ) as Record<SkipCategory, number>
  for (let candidate of skipped) {
    counts[candidate.category] += 1
  }
  return counts
}

/**
 * Compares two values that may be null; null sorts first.
 *
 * @param left - Value expected first.
 * @param right - Value expected second.
 * @param compare - Order of two values that are not null.
 * @returns A negative number when `left` sorts first, a positive number when
 *   `right` sorts first and 0 when both are equal.
 */
function compareNullable<Value>(
  left: Value | null,
  right: Value | null,
  compare: (left: Value, right: Value) => number,
): number {
  if (left === null || right === null) {
    return Number(left !== null) - Number(right !== null)
  }
  return compare(left, right)
}

/**
 * Gets the full text of a line without its line terminator.
 *
 * @param source - Text of the file as read.
 * @param lineStarts - Line start offsets of the text.
 * @param line - 1-based line number.
 * @returns Text of the line.
 */
function getSourceLine(
  source: string,
  lineStarts: number[],
  line: number,
): string {
  let text = source.slice(lineStarts[line - 1], lineStarts[line])
  return text.replace(TRAILING_LINE_TERMINATOR_PATTERN, '')
}

/**
 * Compares two numbers in ascending order.
 *
 * @param left - Number expected first.
 * @param right - Number expected second.
 * @returns The difference of the numbers.
 */
function compareNumbers(left: number, right: number): number {
  return left - right
}
