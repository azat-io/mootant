/**
 * Gives the offset in the file of every code unit of pattern text written as it
 * is, as in a regular expression literal or a `String.raw` template, and the
 * end of the text at the end. Both units of a surrogate pair get the offset of
 * the first, so an edit never splits the pair in the source.
 *
 * @param pattern - Pattern text as written.
 * @param start - Offset of its first character in the file.
 * @returns Offsets of the units.
 */
export function mapPatternOffsets(pattern: string, start: number): number[] {
  let offsets: number[] = []
  for (let index = 0; index < pattern.length; index++) {
    let unit = pattern.charCodeAt(index)
    let isLow =
      unit >= 0xdc_00 &&
      unit <= 0xdf_ff &&
      index > 0 &&
      pattern.codePointAt(index - 1)! > 0xff_ff
    offsets.push(isLow ? offsets[index - 1]! : start + index)
  }
  offsets.push(start + pattern.length)
  return offsets
}
