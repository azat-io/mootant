/**
 * Finds where the text of a line ends, before its line terminator: `\r\n`,
 * `\n`, `\r`, U+2028 or U+2029, as `getLineStarts` of the core splits lines.
 *
 * @param source - Text of a file.
 * @param lineStarts - Offset where each line starts.
 * @param line - 1-based line.
 * @returns Offset just past the last code unit of the text of the line.
 */
export function getLineEnd(
  source: string,
  lineStarts: readonly number[],
  line: number,
): number {
  let next = lineStarts[line]
  if (next === undefined) {
    return source.length
  }
  return next - (source.startsWith('\r\n', next - 2) ? 2 : 1)
}
