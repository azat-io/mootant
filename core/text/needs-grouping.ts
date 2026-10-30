import type { Node } from 'oxc-parser'

/**
 * Where an operand sits relative to the new operator, and the language rules
 * that apply.
 */
interface OperandPlacement {
  /**
   * Language family of the file. TypeScript adds the generic call hazard of
   * `>`.
   */
  language: 'javascript' | 'typescript'

  /**
   * Side of the new operator the operand is on.
   */
  side: 'right' | 'left'
}

/**
 * Precedence of binary and logical operators, higher binds tighter.
 */
let precedences = new Map([
  ['instanceof', 8],
  ['===', 7],
  ['!==', 7],
  ['>>>', 9],
  ['**', 12],
  ['??', 1],
  ['||', 2],
  ['&&', 3],
  ['==', 7],
  ['!=', 7],
  ['<=', 8],
  ['>=', 8],
  ['in', 8],
  ['<<', 9],
  ['>>', 9],
  ['+', 10],
  ['-', 10],
  ['*', 11],
  ['/', 11],
  ['%', 11],
  ['|', 4],
  ['^', 5],
  ['&', 6],
  ['<', 8],
  ['>', 8],
])

/**
 * Operand types that `**` does not accept on its left without parentheses.
 */
let unaryLikeTypes = new Set([
  'UnaryExpression',
  'AwaitExpression',
  'TSTypeAssertion',
])

/**
 * Operand types that bind more loosely than any binary or logical operator.
 */
let looseTypes = new Set([
  'ArrowFunctionExpression',
  'ConditionalExpression',
  'AssignmentExpression',
  'SequenceExpression',
  'YieldExpression',
])

/**
 * Logical operators that cannot be mixed with `??` without parentheses.
 */
let andOrOperators = new Set(['&&', '||'])

/**
 * Precedence of `as` and `satisfies`, the same as relational operators.
 */
const TYPE_OPERATOR_PRECEDENCE = 8

/**
 * Tells whether an operand must be wrapped in parentheses after the operator
 * between it and the other operand is replaced, so that the grouping of the
 * original expression is kept. A conditional, an arrow function, `yield`, an
 * assignment or a sequence always needs them; in a parsed tree such an operand
 * is already in parentheses.
 *
 * @param operand - Operand as it is in the tree, possibly parenthesized.
 * @param operator - Binary or logical operator written in place of the old one.
 * @param placement - Side of the operand and language of the file.
 * @returns Whether the operand text needs parentheses.
 */
export function needsGrouping(
  operand: Node,
  operator: string,
  placement: OperandPlacement,
): boolean {
  let { language, side } = placement
  if (operand.type === 'ParenthesizedExpression') {
    return false
  }
  if (looseTypes.has(operand.type)) {
    return true
  }
  if (
    operator === '**' &&
    side === 'left' &&
    unaryLikeTypes.has(operand.type)
  ) {
    return true
  }

  let operandPrecedence: number
  if (
    operand.type === 'TSAsExpression' ||
    operand.type === 'TSSatisfiesExpression'
  ) {
    /**
     * TypeScript reads the type after `as` and `satisfies` greedily, so `|`,
     * `&` or `<` written after it would join the type.
     */
    if (side === 'left') {
      return true
    }
    operandPrecedence = TYPE_OPERATOR_PRECEDENCE
  } else if (
    operand.type === 'BinaryExpression' ||
    operand.type === 'LogicalExpression'
  ) {
    let inner = operand.operator
    if (
      operand.type === 'LogicalExpression' &&
      ((inner === '??' && andOrOperators.has(operator)) ||
        (operator === '??' && andOrOperators.has(inner)))
    ) {
      return true
    }
    if (
      language === 'typescript' &&
      side === 'left' &&
      operator === '>' &&
      inner === '<'
    ) {
      return true
    }
    operandPrecedence = precedences.get(inner)!
  } else {
    return false
  }

  /**
   * Operators of equal precedence group to the left, except `**`, which groups
   * to the right.
   */
  let operatorPrecedence = precedences.get(operator)!
  return (
    operandPrecedence < operatorPrecedence ||
    (operandPrecedence === operatorPrecedence &&
      (side === 'left') === (operator === '**'))
  )
}
