import type {
  Function as FunctionNode,
  ArrowFunctionExpression,
  IfStatement,
  Node,
} from 'oxc-parser'

import { unwrapParentheses } from '../../tree/unwrap-parentheses'
import { getFunctionReturns } from './get-function-returns'
import { getReturnedValue } from './get-returned-value'
import { getLiteralValue } from './get-literal-value'

/**
 * Function result chosen by one test between two literals.
 */
export interface ReturnSwitch {
  /**
   * The `if` statement that holds the test.
   */
  statement: IfStatement

  /**
   * Literal returned when the test is true, without parentheses.
   */
  consequent: Node

  /**
   * Literal returned when the test is false, without parentheses.
   */
  alternate: Node

  /**
   * Test, without parentheses.
   */
  test: Node
}

/**
 * Finds the return switch of a function (catalog 2.2): its block body ends with
 * `if (t) return A` followed by `return B`, or with `if (t) return A; else
 * return B` (each branch the `return` itself or a block that holds only it),
 * `A` and `B` are literals, and the function has no other `return` outside
 * nested functions. Its result is `t ? A : B`.
 *
 * @param node - Function or arrow function.
 * @returns The switch, or null when the function has none.
 */
export function getReturnSwitch(
  node: ArrowFunctionExpression | FunctionNode,
): ReturnSwitch | null {
  let list = node.body?.type === 'BlockStatement' ? node.body.body : []
  let last = list.at(-1) ?? null
  let statement = last?.type === 'IfStatement' ? last : list.at(-2)
  if (statement?.type !== 'IfStatement') {
    return null
  }
  let alternate = getReturnedValue(
    statement === last ? statement.alternate : last,
  )
  let consequent = getReturnedValue(statement.consequent)
  if (
    !consequent ||
    !alternate ||
    (statement !== last &&
      (statement.alternate || last?.type !== 'ReturnStatement')) ||
    getLiteralValue(consequent) === null ||
    getLiteralValue(alternate) === null ||
    getFunctionReturns(node).length !== 2
  ) {
    return null
  }
  return {
    test: unwrapParentheses(statement.test),
    consequent,
    statement,
    alternate,
  }
}
