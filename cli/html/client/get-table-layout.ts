import { html } from './html'

/**
 * Lays out a table whose rows a filter changes, with the widths of its columns
 * fixed, so that they stay when the rows change. A width counts characters of
 * the table font, which is monospace, plus the padding of the cells; null
 * leaves a column the rest of the row, and the table keeps at least `rest`
 * characters for it, scrolling on a narrow screen.
 *
 * @param widths - Width of each column in characters, or null.
 * @param rest - Fewest characters of the columns without a width.
 * @returns The `colgroup` of the table and the style of its least width.
 */
export function getTableLayout(
  widths: readonly (number | null)[],
  rest: number,
): { colgroup: string; style: string } {
  let last = widths.length - 1
  let characters = 0
  let columns = widths.map((width, position) => {
    characters += width ?? rest
    if (width === null) {
      return '<col>'
    }
    let padding =
      position === 0 || position === last ?
        'var(--space-s) + var(--space-m)'
      : '2 * var(--space-s)'
    return html`<col style="inline-size: calc(${width}ch + ${padding})" />`
  })
  return {
    style: `min-inline-size: calc(${characters}ch + ${2 * last} * var(--space-s) + 2 * var(--space-m))`,
    colgroup: html`<colgroup>
      ${columns.join('')}
    </colgroup>`,
  }
}
