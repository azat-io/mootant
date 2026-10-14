import type { FileMutants } from '../../types/file-mutants'
import type { Mutant } from '../../types/mutant'

import { getSourcePosition } from '../text/get-source-position'
import { getLineStarts } from '../text/get-line-starts'

/**
 * Mutant together with the result of the file it belongs to.
 */
interface LocatedMutant {
  /**
   * Result of the file, whose text gives the position.
   */
  result: FileMutants

  /**
   * Mutant of the file.
   */
  mutant: Mutant
}

/**
 * Checks that no two mutants of a run share an id. Ids of one file differ by
 * construction, so a shared id is a hash collision, which is reported instead
 * of resolved, because any fallback would make an id depend on the listed
 * files.
 *
 * @param files - Results of every file of the run.
 * @throws Error - When two mutants share an id; the message names both
 *   positions.
 */
export function assertUniqueIds(files: readonly FileMutants[]): void {
  let seen = new Map<string, LocatedMutant>()
  for (let result of files) {
    for (let mutant of result.mutants) {
      let earlier = seen.get(mutant.id)
      if (earlier) {
        throw new Error(
          `Mutant id ${mutant.id} is shared by ${formatPosition(earlier)} and ${formatPosition({ result, mutant })}. This is a hash collision; please report it.`,
        )
      }
      seen.set(mutant.id, { result, mutant })
    }
  }
}

/**
 * Formats where a mutant starts.
 *
 * @param located - Mutant and the result of its file.
 * @returns Path, line and column joined with colons.
 */
function formatPosition({ result, mutant }: LocatedMutant): string {
  let { column, line } = getSourcePosition(
    getLineStarts(result.source!),
    mutant.start,
  )
  return `${result.file}:${line}:${column}`
}
