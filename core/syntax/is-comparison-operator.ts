/**
 * Operator of a comparison.
 */
export type ComparisonOperator =
  'instanceof' | '===' | '!==' | '<=' | '>=' | '==' | '!=' | 'in' | '<' | '>'

/**
 * Operators of comparisons.
 */
let comparisonOperators = new Set<string>([
  'instanceof',
  '===',
  '!==',
  '<=',
  '>=',
  '==',
  '!=',
  'in',
  '<',
  '>',
])

/**
 * Tells whether an operator is a comparison operator: a relational or equality
 * operator, `in` or `instanceof`. Each of them always gives a boolean.
 *
 * @param operator - Operator of a binary expression.
 * @returns Whether the operator compares its operands.
 */
export function isComparisonOperator(
  operator: string,
): operator is ComparisonOperator {
  return comparisonOperators.has(operator)
}
