/**
 * Finds the candidate closest to a misspelled name, for a "did you mean"
 * suggestion. The distance is the number of single-character insertions,
 * deletions and substitutions that turn one string into the other.
 *
 * @param name - Name that matched no candidate.
 * @param candidates - Known names in the order in which ties are resolved.
 * @returns The candidate with the smallest distance when that distance is at
 *   most a third of the name length (and at least 2), the first of them on a
 *   tie, or null when no candidate is close enough.
 */
export function findClosestName(
  name: string,
  candidates: readonly string[],
): string | null {
  let closest: string | null = null
  let closestDistance = Math.max(2, Math.floor(name.length / 3)) + 1
  for (let candidate of candidates) {
    let distance = getEditDistance(name, candidate)
    if (distance < closestDistance) {
      closest = candidate
      closestDistance = distance
    }
  }
  return closest
}

/**
 * Counts the single-character insertions, deletions and substitutions that turn
 * one string into another.
 *
 * @param source - String to start from.
 * @param target - String to arrive at.
 * @returns The smallest number of edits.
 */
function getEditDistance(source: string, target: string): number {
  let previous = Array.from({ length: target.length + 1 }, (_, index) => index)
  for (let sourceIndex = 1; sourceIndex <= source.length; sourceIndex++) {
    let current = [sourceIndex]
    for (let targetIndex = 1; targetIndex <= target.length; targetIndex++) {
      let substitution =
        source[sourceIndex - 1] === target[targetIndex - 1] ? 0 : 1
      current.push(
        Math.min(
          previous[targetIndex]! + 1,
          current[targetIndex - 1]! + 1,
          previous[targetIndex - 1]! + substitution,
        ),
      )
    }
    previous = current
  }
  return previous[target.length]!
}
