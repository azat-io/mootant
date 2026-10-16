import { isJoined } from './is-joined'

/**
 * Where the changed part of two texts lies, in graphemes.
 */
export interface ChangedPart {
  /**
   * Index just past the changed part of the replacement.
   */
  replacementEnd: number

  /**
   * Index just past the changed part of the original.
   */
  originalEnd: number

  /**
   * Index of the first changed grapheme, the same in both texts.
   */
  start: number
}

/**
 * Finds the part of a change that differs: the graphemes between the start and
 * the end both texts share, widened to whole words and operators, so `depth >
 * 0` and `depth >= 0` differ in `>` and `>=` rather than in nothing and `=`,
 * and `10` and `11` differ as whole numbers. Text only one side has is first
 * slid to start and end between tokens, if it can be, and to start or end with
 * the range there, so `a === 'x' || a === 'y'` and `a === 'y'` differ in `a ===
 * 'x' || ` rather than in `x' || a === '`. Only the given range may differ; the
 * shared text outside it may widen the part too.
 *
 * @param original - Graphemes of the text before the change.
 * @param replacement - Graphemes of the text after the change.
 * @param range - Range that may differ; the whole texts by default.
 * @param range.start - Index of its first grapheme, the same in both texts.
 * @param range.originalEnd - Index just past it in the original.
 * @param range.replacementEnd - Index just past it in the replacement.
 * @returns The changed part.
 */
export function narrowChange(
  original: readonly string[],
  replacement: readonly string[],
  range: ChangedPart = {
    replacementEnd: replacement.length,
    originalEnd: original.length,
    start: 0,
  },
): ChangedPart {
  let { replacementEnd, originalEnd, start } = range
  while (
    start < originalEnd &&
    start < replacementEnd &&
    original[start] === replacement[start]
  ) {
    start++
  }
  while (
    originalEnd > start &&
    replacementEnd > start &&
    original[originalEnd - 1] === replacement[replacementEnd - 1]
  ) {
    originalEnd--
    replacementEnd--
  }
  if (originalEnd === start || replacementEnd === start) {
    let slid = slideToBoundaries(
      originalEnd === start ? replacement : original,
      { end: Math.max(originalEnd, replacementEnd), start },
      {
        end: Math.max(range.originalEnd, range.replacementEnd),
        start: range.start,
      },
    )
    if (slid !== null) {
      let shift = start - slid
      return {
        replacementEnd: replacementEnd - shift,
        originalEnd: originalEnd - shift,
        start: slid,
      }
    }
  }
  while (
    start > 0 &&
    ((start < originalEnd &&
      isJoined(original[start - 1]!, original[start]!)) ||
      (start < replacementEnd &&
        isJoined(original[start - 1]!, replacement[start]!)))
  ) {
    start--
  }
  while (
    originalEnd < original.length &&
    ((originalEnd > start &&
      isJoined(original[originalEnd]!, original[originalEnd - 1]!)) ||
      (replacementEnd > start &&
        isJoined(original[originalEnd]!, replacement[replacementEnd - 1]!)))
  ) {
    originalEnd++
    replacementEnd++
  }
  return { replacementEnd, originalEnd, start }
}

/**
 * Slides text that only one side has to the left, over the text both sides
 * share, while it stays the same text, to where it starts and ends between
 * tokens: the place where it also starts or ends with the range that may
 * differ, else the rightmost, so a removed property `b: 2, ` of `a: 1, b: 2, c:
 * 3` is not found as `2, c: 3` minus `c: 3` or split inside a word.
 *
 * @param text - Graphemes of the side that has the text.
 * @param found - Where the text is found, as far right as it can be.
 * @param found.start - Index of the first grapheme of the text.
 * @param found.end - Index just past its last grapheme.
 * @param range - Range that may differ, on the side that has the text.
 * @param range.start - Index of its first grapheme.
 * @param range.end - Index just past its last grapheme.
 * @returns Index the text starts at, or null when it never lies between tokens.
 */
function slideToBoundaries(
  text: readonly string[],
  found: { start: number; end: number },
  range: { start: number; end: number },
): number | null {
  let between: number | null = null
  for (let shift = 0; ; shift++) {
    let first = found.start - shift
    let last = found.end - shift
    if (
      (!(first > 0) || !isJoined(text[first - 1]!, text[first]!)) &&
      (!(last < text.length) || !isJoined(text[last - 1]!, text[last]!))
    ) {
      if (first === range.start || last === range.end) {
        return first
      }
      between ??= first
    }
    if (first === 0 || text[first - 1] !== text[last - 1]) {
      return between
    }
  }
}
