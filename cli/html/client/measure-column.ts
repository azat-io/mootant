/**
 * Counts the characters a column of a table needs: its longest text or its
 * header, at most a limit past which the text wraps or is cut.
 *
 * @param texts - Texts of the column in every row, shown or not.
 * @param header - Text at the top of the column, which must fit too.
 * @param limit - Most characters to make room for.
 * @returns Width in characters.
 */
export function measureColumn(
  texts: readonly string[],
  header: string,
  limit = Infinity,
): number {
  let width = header.length
  for (let text of texts) {
    width = Math.max(width, text.length)
  }
  return Math.min(width, limit)
}
