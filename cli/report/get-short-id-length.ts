/**
 * Fewest characters a short id has.
 */
const MIN_LENGTH = 4

/**
 * Finds how many leading characters tell every id apart, as Git shortens commit
 * hashes, but one length for all ids, so they line up: at least four, at most
 * the length of the longest id.
 *
 * @param ids - Full ids of every mutant of the run.
 * @returns Length to cut ids to.
 */
export function getShortIdLength(ids: readonly string[]): number {
  let sorted = ids.toSorted()
  let length = MIN_LENGTH
  for (let index = 1; index < sorted.length; index++) {
    let previous = sorted[index - 1]!
    let current = sorted[index]!
    let shared = 0
    while (
      shared < current.length &&
      shared < previous.length &&
      current[shared] === previous[shared]
    ) {
      shared++
    }
    length = Math.max(length, shared + 1)
  }
  let longest = ids.reduce((widest, id) => Math.max(widest, id.length), 0)
  return Math.min(length, Math.max(longest, MIN_LENGTH))
}
