import type {
  HtmlReportSkipped,
  HtmlReportMutant,
  HtmlReport,
} from '../../../types/report/html-report'
import type { IndexedMutator } from '../../../types/html/indexed-mutator'
import type { IndexedMutant } from '../../../types/html/indexed-mutant'
import type { ReportIndex } from '../../../types/html/report-index'
import type { IndexedFile } from '../../../types/html/indexed-file'
import type { RunStatus } from '../../../types/run/run-status'

import { getSourcePosition } from '../../../core/text/get-source-position'
import { getLineStarts } from '../../../core/text/get-line-starts'
import { countStatuses } from '../../../core/run/count-statuses'
import { computeScore } from '../../../core/run/compute-score'
import { unpackReplacement } from './unpack-replacement'

/**
 * Statuses of the mutants to act on.
 */
const ACTIONABLE = new Set<RunStatus>(['NoCoverage', 'Survived', 'Error'])

/**
 * Reads the data of the HTML report into what the page shows: each file with
 * its line starts, mutants, skipped candidates, counts, score and isolated
 * cost; each mutant and skipped candidate with its position, original text and
 * whole replacement; the files from the lowest score; the mutants to act on in
 * that order; and each mutator with the verdicts of its mutants and its skipped
 * candidates.
 *
 * @param report - Packed run report with sources and tests, as embedded.
 * @returns Files, mutants and mutators with positions, counts and scores.
 */
export function indexReport(report: HtmlReport): ReportIndex {
  let costs = new Map(report.summary.staticCost.map(cost => [cost.file, cost]))
  let files = report.files.map((file, index): IndexedFile => {
    let source = file.source ?? ''
    let slash = file.file.lastIndexOf('/')
    return {
      directory: slash === -1 ? '' : file.file.slice(0, slash),
      cost: costs.get(file.file) ?? null,
      lineStarts: getLineStarts(source),
      name: file.file.slice(slash + 1),
      readable: file.source !== null,
      counts: countStatuses([]),
      path: file.file,
      actionable: [],
      score: null,
      mutants: [],
      skipped: [],
      source,
      index,
    }
  })
  let mutants = report.mutants.map((mutant, index): IndexedMutant => {
    let file = files[mutant.file]!
    let indexed: IndexedMutant = {
      ...mutant,
      ...locateEntry(mutant, file),
      index,
    }
    file.mutants.push(indexed)
    return indexed
  })
  for (let entry of report.skipped) {
    let file = files[entry.file]!
    file.skipped.push({
      ...entry,
      ...locateEntry(entry, file),
      index: file.skipped.length,
    })
  }
  for (let file of files) {
    file.counts = countStatuses(file.mutants)
    file.score = computeScore(file.counts).total
    file.actionable = file.mutants.filter(mutant =>
      ACTIONABLE.has(mutant.status),
    )
  }
  let worstFiles = files.toSorted(
    (first, second) =>
      (first.score ?? 101) - (second.score ?? 101) ||
      second.counts.Survived - first.counts.Survived ||
      first.path.localeCompare(second.path),
  )
  let mutators = report.mutators.map((mutator, index): IndexedMutator => {
    let counts = countStatuses(
      mutants.filter(mutant => mutant.mutator === index),
    )
    return {
      ...mutator,
      skipped: report.skipped.filter(entry => entry.mutator === index).length,
      score: computeScore(counts).total,
      counts,
    }
  })
  return {
    byId: new Map(mutants.map(mutant => [mutant.id, mutant])),
    actionable: worstFiles.flatMap(file => file.actionable),
    counts: countStatuses(mutants),
    worstFiles,
    mutators,
    mutants,
    report,
    files,
  }
}

/**
 * Reads where a mutant or a skipped candidate is in its file, the text it
 * replaces and its whole replacement.
 *
 * @param entry - Mutant or skipped candidate as packed.
 * @param file - Its file with source and line starts.
 * @returns Original text, whole replacement and position.
 */
function locateEntry(
  entry: HtmlReportSkipped | HtmlReportMutant,
  file: IndexedFile,
): Pick<
  IndexedMutant,
  'replacement' | 'original' | 'endLine' | 'column' | 'line'
> {
  let start = getSourcePosition(file.lineStarts, entry.start)
  let original = file.source.slice(entry.start, entry.end)
  return {
    endLine: getSourcePosition(
      file.lineStarts,
      Math.max(entry.start, entry.end - 1),
    ).line,
    replacement: unpackReplacement(original, entry),
    column: start.column,
    line: start.line,
    original,
  }
}
