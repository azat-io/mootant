import { runInThisContext } from 'node:vm'

/**
 * Evaluates an expression on every input, the way the catalog's brute force
 * runs a formula and each of its mutants (12.2 to 12.4). The expression is
 * compiled once, as the body of a function of the names.
 *
 * @param expression - JavaScript expression over the names.
 * @param names - Names the expression reads, in the order of the input values.
 * @param inputs - Values of the names, one row per input.
 * @returns Value of the expression on each input.
 */
export function evaluateExpression(
  expression: string,
  names: string[],
  inputs: unknown[][],
): unknown[] {
  let evaluate = runInThisContext(
    `(${names.join(', ')}) => (${expression})`,
  ) as (...values: unknown[]) => unknown
  return inputs.map(input => evaluate(...input))
}
