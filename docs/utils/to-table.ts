/**
 * Writes a table of Markdown. Pipes inside cells are escaped, also in code, as
 * tables of GitHub Flavored Markdown require.
 *
 * @param header - Cells of the header row.
 * @param rows - Cells of each row.
 * @returns Markdown of the rows with the header first.
 */
export function toTable(header: string[], rows: string[][]): string {
  return [header, header.map(() => '---'), ...rows]
    .map(
      cells =>
        `| ${cells.map(cell => cell.replaceAll('|', '\\|')).join(' | ')} |`,
    )
    .join('\n')
}
