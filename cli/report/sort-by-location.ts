import type { ListReportFocus } from '../../types/report/list-report-focus'

/**
 * Sorts report entries by the position text reports show: files keep the order
 * they first appear in, and the entries of one file go by the line and column
 * of their focus when they have one, otherwise of their range. Entries at the
 * same position keep their order.
 *
 * @param entries - Mutants or skipped candidates of a report.
 * @returns A sorted copy.
 */
export function sortByLocation<
  Entry extends {
    focus?: ListReportFocus
    column: number
    line: number
    file: string
  },
>(entries: readonly Entry[]): Entry[] {
  let fileOrder = new Map<string, number>()
  for (let entry of entries) {
    if (!fileOrder.has(entry.file)) {
      fileOrder.set(entry.file, fileOrder.size)
    }
  }
  return entries.toSorted((left, right) => {
    let leftPosition = left.focus ?? left
    let rightPosition = right.focus ?? right
    return (
      fileOrder.get(left.file)! - fileOrder.get(right.file)! ||
      leftPosition.line - rightPosition.line ||
      leftPosition.column - rightPosition.column
    )
  })
}
