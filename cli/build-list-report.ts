import type { ListReportMutant } from '../types/list-report-mutant'
import type { ListResult } from '../types/list-result'
import type { ListReport } from '../types/list-report'
import type { Diagnostic } from '../types/diagnostic'

import { getSourcePosition } from '../core/text/get-source-position'
import { compareCodeUnits } from '../core/compare-code-units'
import { getLineStarts } from '../core/text/get-line-starts'

/**
 * Line terminator at the end of a line of text: CRLF, CR, LF, U+2028 or U+2029.
 */
const TRAILING_LINE_TERMINATOR_PATTERN = /(?:\r\n|[\n\r\u{2028}\u{2029}])$/u

/**
 * Turns the result of a list run into the report that every formatter reads:
 * positions, original fragments, source lines, descriptions, counts and sorted
 * diagnostics.
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

  return {
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
