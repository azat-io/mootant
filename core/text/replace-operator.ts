import type { OperatorExpression } from '../../types/operator-expression'
import type { ParsedFile } from '../../types/parsed-file'

import { getOperatorRange } from './get-operator-range'
import { needsSeparator } from './needs-separator'
import { needsGrouping } from './needs-grouping'

/**
 * Operators a binary or logical expression may get.
 */
let binaryOperators = new Set([
  'instanceof',
  '===',
  '!==',
  '>>>',
  '??',
  '||',
  '&&',
  '==',
  '!=',
  '<=',
  '>=',
  'in',
  '<<',
  '>>',
  '**',
  '|',
  '^',
  '&',
  '<',
  '>',
  '+',
  '-',
  '*',
  '/',
  '%',
])

/**
 * Operators an assignment expression may get.
 */
let assignmentOperators = new Set([
  '>>>=',
  '**=',
  '<<=',
  '>>=',
  '&&=',
  '||=',
  '??=',
  '+=',
  '-=',
  '*=',
  '/=',
  '%=',
  '&=',
  '|=',
  '^=',
  '=',
])

/**
 * Operators a unary expression may get.
 */
let unaryOperators = new Set(['typeof', 'delete', 'void', '-', '+', '!', '~'])

/**
 * Operators an update expression may get.
 */
let updateOperators = new Set(['++', '--'])

/**
 * The only operator a private-in expression such as `#x in o` may get.
 */
let privateInOperators = new Set(['in'])

/**
 * Builds the text of an expression with its operator token replaced. A space is
 * inserted where the new operator would merge with an adjacent character, and
 * an operand of a binary or logical expression is wrapped in parentheses where
 * the new operator would change its grouping.
 *
 * @param parsed - File the node belongs to.
 * @param node - Expression whose operator is replaced.
 * @param operator - Operator written in place of the old one; it must be valid
 *   for the kind of the node.
 * @returns Text of the node with the new operator.
 * @throws TypeError - When the operator is not valid for the kind of the node.
 */
export function replaceOperator(
  parsed: ParsedFile,
  node: OperatorExpression,
  operator: string,
): string {
  if (!getAcceptedOperators(node).has(operator)) {
    throw new TypeError(
      `Operator "${operator}" cannot replace "${node.operator}".`,
    )
  }

  let { language, text } = parsed
  let { start, end } = getOperatorRange(parsed, node)
  let before = text.slice(node.start, start)
  let after = text.slice(end, node.end)

  if (node.type === 'BinaryExpression' || node.type === 'LogicalExpression') {
    let { right, left } = node
    let leftText = text.slice(left.start, left.end)
    if (needsGrouping(left, operator, { side: 'left', language })) {
      leftText = `(${leftText})`
    }
    let rightText = text.slice(right.start, right.end)
    if (needsGrouping(right, operator, { side: 'right', language })) {
      rightText = `(${rightText})`
    }
    before =
      text.slice(node.start, left.start) +
      leftText +
      text.slice(left.end, start)
    after =
      text.slice(end, right.start) + rightText + text.slice(right.end, node.end)
  }

  let token = operator
  if (needsSeparator(before, token)) {
    token = ` ${token}`
  }
  if (needsSeparator(token, after)) {
    token = `${token} `
  }
  return before + token + after
}

/**
 * Selects the operators that can replace the operator of a node.
 *
 * @param node - Expression whose operator is replaced.
 * @returns Operators valid for the kind of the node.
 */
function getAcceptedOperators(node: OperatorExpression): ReadonlySet<string> {
  switch (node.type) {
    case 'AssignmentExpression':
      return assignmentOperators
    case 'UpdateExpression':
      return updateOperators
    case 'UnaryExpression':
      return unaryOperators
    default:
      return node.left.type === 'PrivateIdentifier' ?
          privateInOperators
        : binaryOperators
  }
}
