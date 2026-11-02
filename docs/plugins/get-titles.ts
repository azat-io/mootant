import type { HastNode } from './wrap-elements'

import { getElements } from './get-elements'
import { getText } from './get-text'

/**
 * Returns the titles of the columns of a table.
 *
 * @param table - Table to read.
 * @returns Text of each cell in its first row.
 */
export function getTitles(table: HastNode): string[] {
  let [head] = getElements(table)
  return getElements(getElements(head)[0]).map(cell => getText(cell))
}
