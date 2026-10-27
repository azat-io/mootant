/**
 * Fewest characters the kept start and end must save before a replacement is
 * stored without them.
 */
const MIN_KEPT = 32

/**
 * Shortens a replacement for the HTML report: a mutant often keeps most of the
 * text it replaces, such as an object literal with one property dropped, so the
 * start and the end it shares with the original are stored as their lengths and
 * only the text between them is kept.
 *
 * @param original - Source text the mutant replaces.
 * @param replacement - Text written in its place.
 * @returns The replacement, or the text between the kept start and end with
 *   their lengths.
 */
export function packReplacement(
  original: string,
  replacement: string,
): { keep?: [start: number, end: number]; replacement: string } {
  let longest = Math.min(original.length, replacement.length)
  let start = 0
  while (start < longest && original[start] === replacement[start]) {
    start += 1
  }
  let end = 0
  while (
    end < longest - start &&
    original[original.length - 1 - end] ===
      replacement[replacement.length - 1 - end]
  ) {
    end += 1
  }
  if (start + end < MIN_KEPT) {
    return { replacement }
  }
  return {
    replacement: replacement.slice(start, replacement.length - end),
    keep: [start, end],
  }
}
