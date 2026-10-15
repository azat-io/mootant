/**
 * Longest fragment shown as is; longer fragments are cut.
 */
const MAX_FRAGMENT_LENGTH = 60

/**
 * Shows a source fragment on one line: runs of whitespace become one space,
 * long texts are cut without splitting an astral character, and an empty text
 * is named.
 *
 * @param text - Original or replacement text of a mutant.
 * @returns Text that fits a report line.
 */
export function shortenFragment(text: string): string {
  let collapsed = text.replaceAll(/\s+/gu, ' ').trim()
  if (collapsed === '') {
    return '(empty)'
  }
  if (collapsed.length <= MAX_FRAGMENT_LENGTH) {
    return collapsed
  }
  let cut = MAX_FRAGMENT_LENGTH - 3
  if (collapsed.codePointAt(cut - 1)! > 0xff_ff) {
    cut -= 1
  }
  return `${collapsed.slice(0, cut)}...`
}
