/**
 * Tells whether a column of a table shows the mutants of its rows.
 *
 * @param title - Text in the head of the column.
 * @returns True for the title `Mutant` or `Mutants`.
 */
export function isMutantColumn(title: string): boolean {
  return /^Mutants?$/u.test(title)
}
