import type {
  Function as FunctionNode,
  ArrowFunctionExpression,
  ReturnStatement,
  IfStatement,
} from 'oxc-parser'

/**
 * Tells whether a statement is the whole block body of a function, apart from
 * the final `return` of a return switch whose `if` the statement is (catalog
 * 2.2, O12): a callback that runs other statements keeps running them under a
 * constant result.
 *
 * @param enclosing - Function that holds the statement.
 * @param statement - Return statement, or the `if` of a return switch.
 * @returns Whether nothing else runs in the function.
 */
export function isWholeBody(
  enclosing: ArrowFunctionExpression | FunctionNode,
  statement: ReturnStatement | IfStatement,
): boolean {
  let { body } = enclosing
  return (
    body?.type === 'BlockStatement' &&
    body.body[0] === statement &&
    (body.body.length === 1 ||
      (body.body.length === 2 &&
        statement.type === 'IfStatement' &&
        body.body[1]!.type === 'ReturnStatement'))
  )
}
