import type { IndexedMutator } from '../../../types/html/indexed-mutator'
import type { IndexedMutant } from '../../../types/html/indexed-mutant'
import type { ReportIndex } from '../../../types/html/report-index'
import type { IndexedFile } from '../../../types/html/indexed-file'
import type { HtmlReport } from '../../../types/report/html-report'
import type { RunStatus } from '../../../types/run/run-status'

import { getSourcePosition } from '../../../core/text/get-source-position'
import { getLineStarts } from '../../../core/text/get-line-starts'
import { unpackReplacement } from './unpack-replacement'
import { countStatuses } from './count-statuses'
import { getScore } from './get-score'

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
    let start = getSourcePosition(file.lineStarts, mutant.start)
    let original = file.source.slice(mutant.start, mutant.end)
    let indexed: IndexedMutant = {
      ...mutant,
      endLine: getSourcePosition(
        file.lineStarts,
        Math.max(mutant.start, mutant.end - 1),
      ).line,
      replacement: unpackReplacement(original, mutant),
      column: start.column,
      line: start.line,
      original,
      index,
    }
    file.mutants.push(indexed)
    return indexed
  })
  for (let entry of report.skipped) {
    let file = files[entry.file]!
    let start = getSourcePosition(file.lineStarts, entry.start)
    let original = file.source.slice(entry.start, entry.end)
    file.skipped.push({
      ...entry,
      endLine: getSourcePosition(
        file.lineStarts,
        Math.max(entry.start, entry.end - 1),
      ).line,
      replacement: unpackReplacement(original, entry),
      index: file.skipped.length,
      column: start.column,
      line: start.line,
      original,
    })
  }
  for (let file of files) {
    file.counts = countStatuses(file.mutants)
    file.score = getScore(file.counts)
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
      score: getScore(counts),
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
