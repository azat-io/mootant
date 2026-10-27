import type { IndexedMutant } from '../../../types/html/indexed-mutant'
import type { ReportIndex } from '../../../types/html/report-index'

import { describeStatus } from './describe-status'
import { getFileHref } from './get-file-href'

/**
 * Result of a search of the report.
 */
interface SearchResult {
  /**
   * What the result is: `file`, `test` or the status of a mutant.
   */
  kind: string

  /**
   * Location the result opens.
   */
  href: string

  /**
   * Text the result shows.
   */
  text: string
}

/**
 * Most results a search returns.
 */
const MAX_RESULTS = 30

/**
 * Searches the report for a text, ignoring case: files by path, mutants by id,
 * mutator, `file:line` and the text they replace or write, the mutants to act
 * on first, and tests by name. Without a text, the first mutants to act on are
 * the results.
 *
 * @param index - Index of the report.
 * @param query - Text to look for.
 * @returns Results in the order to show.
 */
export function findSearchResults(
  index: ReportIndex,
  query: string,
): SearchResult[] {
  let { report } = index
  let text = query.trim().toLowerCase()
  if (text === '') {
    return index.actionable
      .slice(0, MAX_RESULTS)
      .map(mutant => describe(index, mutant))
  }
  let files = index.files
    .filter(file => file.path.toLowerCase().includes(text))
    .map(file => ({
      href: getFileHref(file.path),
      text: file.path,
      kind: 'file',
    }))
  let mutants = index.mutants
    .filter(mutant =>
      [
        mutant.id,
        report.mutators[mutant.mutator]!.id,
        `${index.files[mutant.file]!.path}:${mutant.line}`,
        mutant.original,
        mutant.replacement,
      ].some(field => field.toLowerCase().includes(text)),
    )
    .toSorted(
      (first, second) =>
        describeStatus(second.status).rank - describeStatus(first.status).rank,
    )
    .map(mutant => describe(index, mutant))
  let tests = report.tests
    .map((test, position) => ({ position, test }))
    .filter(({ test }) => test.name.toLowerCase().includes(text))
    .map(({ position, test }) => ({
      text: test.name.replaceAll(' > ', ' › '),
      href: `#/tests/${position}`,
      kind: 'test',
    }))
  return [...files, ...mutants, ...tests].slice(0, MAX_RESULTS)
}

/**
 * Describes a mutant as a search result: its place, mutator and change on one
 * line, with its status.
 *
 * @param index - Index of the report.
 * @param mutant - Mutant found.
 * @returns Result that opens the mutant.
 */
function describe(index: ReportIndex, mutant: IndexedMutant): SearchResult {
  let file = index.files[mutant.file]!
  let mutator = index.report.mutators[mutant.mutator]!
  let before = mutant.original.replaceAll(/\s+/gu, ' ')
  let after = mutant.replacement.replaceAll(/\s+/gu, ' ') || 'removed'
  return {
    text: `${file.path}:${mutant.line}  ${mutator.id}  ${before} → ${after}`,
    kind: describeStatus(mutant.status).label,
    href: `#/mutant/${mutant.id}`,
  }
}
