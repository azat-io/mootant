import {
  getGraphemeWidth,
  getDisplayWidth,
  splitGraphemes,
} from './get-display-width'

/**
 * Cuts plain text to the terminal columns it has, without splitting a
 * character, and marks the cut with an ellipsis: at the end by default, or at
 * the start, which keeps the end of a path such as `…/deep/file.ts`.
 *
 * @param text - Plain text without colors or line breaks.
 * @param limit - Room and mark of the cut.
 * @param limit.width - Most columns of the result, the ellipsis included.
 * @param limit.ellipsis - Mark of the cut.
 * @param limit.side - Side that loses characters; the end by default.
 * @returns The text, cut when wider than the width.
 */
export function cutToWidth(
  text: string,
  limit: { side?: 'start' | 'end'; ellipsis: string; width: number },
): string {
  let { side = 'end', ellipsis, width } = limit
  if (getDisplayWidth(text) <= width) {
    return text
  }
  let graphemes = splitGraphemes(text)
  if (side === 'start') {
    graphemes = graphemes.toReversed()
  }
  let room = width - getDisplayWidth(ellipsis)
  let kept: string[] = []
  for (let grapheme of graphemes) {
    room -= getGraphemeWidth(grapheme)
    if (room < 0) {
      break
    }
    kept.push(grapheme)
  }
  return side === 'start' ?
      `${ellipsis}${kept.toReversed().join('')}`
    : `${kept.join('')}${ellipsis}`
}
