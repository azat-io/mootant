import type { SkippedMutant } from '../../types/mutant/skipped-mutant'
import type { FileMutants } from '../../types/mutant/file-mutants'
import type { ChangedLines } from '../../types/git/changed-lines'
import type { Mutant } from '../../types/mutant/mutant'

import { getSourcePosition } from '../text/get-source-position'
import { getMutantSite } from '../generate/get-mutant-site'

/**
 * Keeps the mutants on changed lines, for `--since`: only the files that
 * changed, with their diagnostics, and in them the mutants and skipped
 * candidates whose lines, from the first to the last, include a changed one. A
 * skipped candidate kept this way also keeps the mutants it is left to, on
 * whatever line (see `findJustifiers`), so that a change skipped in favor of a
 * mutant on an unchanged line is still tested, as a run of every mutant tests
 * it. Every mutant of a file git does not track is kept. Lines are counted as
 * git counts them, by line feeds only, so a lone carriage return or a line
 * separator in a string does not shift them.
 *
 * @param files - Listed files with their skipped candidates.
 * @param changed - Changed lines by real absolute path.
 * @param skipped - Whether the skipped candidates are listed; when not, they
 *   only select the mutants they are left to and are dropped.
 * @returns The changed files with the mutants and skipped candidates kept.
 */
export function selectChangedMutants(
  files: FileMutants[],
  changed: ChangedLines['files'],
  skipped: boolean,
): FileMutants[] {
  return files.flatMap(file => {
    let lines = changed.get(file.absolute)
    if (lines === undefined) {
      return []
    }
    let { source } = file
    if (lines === 'all' || source === null) {
      return [skipped ? file : { ...file, skipped: [] }]
    }
    let changedLines = lines
    let lineStarts = [0]
    for (
      let index = source.indexOf('\n');
      index !== -1;
      index = source.indexOf('\n', index + 1)
    ) {
      lineStarts.push(index + 1)
    }
    /**
     * Tells whether a range spans a changed line.
     *
     * @param range - Offsets of the range.
     * @param range.start - Offset of its first character.
     * @param range.end - Offset after its last character.
     * @returns Whether a line of the range changed.
     */
    function isChanged(range: { start: number; end: number }): boolean {
      let first = getSourcePosition(lineStarts, range.start).line
      let last = getSourcePosition(lineStarts, range.end).line
      for (let line = first; line <= last; line++) {
        if (changedLines.has(line)) {
          return true
        }
      }
      return false
    }
    let changedSkipped = file.skipped.filter(isChanged)
    let justifiers = findJustifiers(file, changedSkipped)
    return [
      {
        ...file,
        mutants: file.mutants.filter(
          mutant => isChanged(mutant) || justifiers.has(mutant),
        ),
        skipped: skipped ? changedSkipped : [],
      },
    ]
  })
}

/**
 * Finds the mutants that skipped candidates are left to. A skip names a listed
 * mutant by its id; otherwise it names a mutator and a place (see
 * `getMutantSite`), and every mutant of that mutator there counts, since such a
 * skip does not tell which replacement it is left to, such as condition's
 * `true` or `false`. A skipped candidate of that mutator there, such as a
 * duplicate or a change left to yet another mutant, is followed in turn, on
 * whatever line of the file it is, until the chain ends at listed mutants or at
 * a skip that names none.
 *
 * @param file - Listed file with every skipped candidate.
 * @param skipped - Skipped candidates whose mutants are sought.
 * @returns Listed mutants of the file that the skipped candidates are left to.
 */
function findJustifiers(
  file: FileMutants,
  skipped: readonly SkippedMutant[],
): Set<Mutant> {
  let byId = new Map(file.mutants.map(mutant => [mutant.id, mutant]))
  let bySite = new Map<string, (SkippedMutant | Mutant)[]>()
  for (let entry of [...file.mutants, ...file.skipped]) {
    let key = getSiteKey(entry.mutator, getMutantSite(entry))
    bySite.set(key, [...(bySite.get(key) ?? []), entry])
  }
  let found = new Set<Mutant>()
  let followed = new Set(skipped)
  let pending = [...skipped]
  while (pending.length > 0) {
    let { by } = pending.pop()!
    if (by !== null && by.id !== null) {
      found.add(byId.get(by.id)!)
    } else if (by !== null) {
      let named = bySite.get(getSiteKey(by.mutator, by.start))
      if (named) {
        for (let entry of named) {
          if ('id' in entry) {
            found.add(entry)
          } else if (!followed.has(entry)) {
            followed.add(entry)
            pending.push(entry)
          }
        }
      }
    }
  }
  return found
}

/**
 * Keys a place of a mutator.
 *
 * @param mutator - Id of the mutator.
 * @param site - Offset where the mutant is placed.
 * @returns Key of the mutator at the place.
 */
function getSiteKey(mutator: string, site: number): string {
  return `${site} ${mutator}`
}
