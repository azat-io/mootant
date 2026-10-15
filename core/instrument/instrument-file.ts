import type { Mutant } from '../../types/mutant/mutant'

import { findStatementStarts } from './find-statement-starts'
import { groupMutantRanges } from './group-mutant-ranges'
import { renderMutantRange } from './render-mutant-range'

/**
 * File to switch with the mutants to host in it.
 */
interface InstrumentFileInput {
  /**
   * Pending mutants of the file; every one gets a site.
   */
  mutants: readonly Mutant[]

  /**
   * Text of the file as read, which the mutant offsets refer to.
   */
  source: string

  /**
   * Name of the file, whose extension selects the language.
   */
  file: string
}

/**
 * Builds the switched text of a file: every mutant is hosted behind a site
 * check of the mutant runtime, so one text runs the original code or any one of
 * its mutants. Mutants of one range share a host; nested ranges are hosted
 * inside the original branch of the outer one. No source map is made.
 *
 * @param input - File name, text and mutants.
 * @returns The switched text, or the text as is when there are no mutants.
 * @throws Error - When the text does not parse, mutants of one range differ in
 *   kind, or ranges overlap.
 */
export function instrumentFile(input: InstrumentFileInput): string {
  let { mutants, source, file } = input
  if (mutants.length === 0) {
    return source
  }
  let ranges = groupMutantRanges(mutants)
  let statementStarts = findStatementStarts(file, source)
  let switched = ''
  let cursor = 0
  for (let range of ranges) {
    switched += source.slice(cursor, range.start)
    switched += renderMutantRange(range, source, statementStarts)
    cursor = range.end
  }
  return switched + source.slice(cursor)
}
