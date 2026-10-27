/**
 * Restores a replacement stored by `packReplacement`.
 *
 * @param original - Source text the mutant replaces.
 * @param entry - Stored replacement with the lengths of the kept start and end
 *   of the original, if any.
 * @param entry.replacement - Replacement, or the text between the kept start
 *   and end.
 * @param entry.keep - Lengths of the kept start and end.
 * @returns Whole replacement.
 */
export function unpackReplacement(
  original: string,
  entry: { keep?: [start: number, end: number]; replacement: string },
): string {
  if (!entry.keep) {
    return entry.replacement
  }
  let [start, end] = entry.keep
  return `${original.slice(0, start)}${entry.replacement}${original.slice(original.length - end)}`
}
