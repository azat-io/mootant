import type { PrivateInExpression, BinaryExpression, Node } from 'oxc-parser'

import type { MutatorContext } from '../../types/mutator/mutator-context'
import type { LiteralValue } from './shared/get-literal-value'
import type { SkipNote } from '../../types/mutant/skip-note'
import type { Mutator } from '../../types/mutator/mutator'

import { getLiteralValue } from './shared/get-literal-value'
import { isNumericPair } from './shared/is-numeric-pair'
import { isNumberType } from './shared/is-number-type'

/**
 * Operator written in place of each arithmetic operator.
 */
let swaps = new Map<string, string>([
  ['**', '*'],
  ['+', '-'],
  ['-', '+'],
  ['*', '/'],
  ['/', '*'],
  ['%', '*'],
])

/**
 * Right operand literals that make the swap of each operator change nothing.
 */
let identities = new Map<string, Set<LiteralValue>>([
  ['*', new Set([-1n, -1, 1n, 1])],
  ['/', new Set([-1n, -1, 1n, 1])],
  ['**', new Set([1n, 1])],
  ['+', new Set([0n, 0])],
  ['-', new Set([0n, 0])],
])

/**
 * Swaps an arithmetic operator, or drops the right operand of a + that is not
 * known to be numeric (catalog 4.1). A numeric `+` becomes `-`; any other `+`
 * keeps only its left operand, unless the right operand is a string literal or
 * a template without expressions (string-literal owns it, O11, except in a
 * timer delay, where the emptying is skipped) or the expression builds an error
 * message (NOISE). The other operators swap: `-` to `+`, `*` to `/`, `/`, `%`
 * and `**` to `*`. Swaps are skipped for identities (`+ 0`, `- 0` after a
 * number, `* 1`, `/ -1`, `** 1`, EQ) and for a `+` or `-` before a unary `-`
 * that is not a negative number literal (unary-operator owns it, O14). Skipped
 * mutants follow as skipped replacements.
 */
export let arithmeticOperator: Mutator = {
  create(context) {
    let { sourceCode, hints } = context
    return {
      BinaryExpression(node) {
        let swap = swaps.get(node.operator)
        if (swap === undefined) {
          return []
        }
        let { operator, right, left } = node
        if (
          operator === '+' &&
          !isNumericPair(hints.getType(left), hints.getType(right))
        ) {
          let text = sourceCode.text.slice(node.start, left.end)
          let skip = getDropSkip(node, context)
          return [skip ? { text, skip, node } : { text, node }]
        }
        let text = sourceCode.replaceOperator(node, swap)
        let skip = getSwapSkip(node, swap, context)
        return [skip ? { text, skip, node } : { text, node }]
      },
    }
  },
  meta: {
    description:
      'Swaps an arithmetic operator, or drops the right operand of a + that is not known to be numeric.',
  },
}

/**
 * Decides whether the swap of an arithmetic operator is skipped (catalog 4.1):
 * the right operand is an identity of the operator (EQ; for `+` and `-` only
 * once the hints make the left operand a number), or a unary `-` that
 * unary-operator removes (O14).
 *
 * @param node - Arithmetic expression.
 * @param swap - Operator written in place of the operator.
 * @param context - Mutator context of the file.
 * @returns Rule and reason of the skip, or null when the mutant is emitted.
 */
function getSwapSkip(
  node: PrivateInExpression | BinaryExpression,
  swap: string,
  context: MutatorContext,
): SkipNote | null {
  let { operator, right, left } = node
  let value = getLiteralValue(right)
  if (
    value !== null &&
    identities.get(operator)?.has(value) &&
    (operator !== '-' || isNumberType(context.hints.getType(left)))
  ) {
    let additive = operator === '+' || operator === '-'
    return {
      reason: `with the right operand ${String(value)}, ${operator} and ${swap} give the same result`,
      rule: additive ? 'numeric-identity' : 'identity-operand',
    }
  }
  let inner = context.syntax.unwrapExpression(right)
  if (isOperandNegation(operator, inner)) {
    return {
      reason:
        "it equals unary-operator's removal of the - of the right operand",
      by: { mutator: 'unary-operator', node: inner },
      rule: 'O14',
    }
  }
  return null
}

/**
 * Decides whether the drop of the right operand of a `+` that is not known to
 * be numeric is skipped (catalog 4.1): the expression builds an error message
 * (NOISE), whose operands string-literal skips too, or the right operand is a
 * string literal or a template without expressions (O11). In a timer delay the
 * drop is not owned: the emptying of the string is skipped there as a timer
 * delay, while the drop may change the type of the delay, such as `x + '0'`
 * turned into `x`, so it stays a mutant.
 *
 * @param node - `+` expression.
 * @param context - Mutator context of the file.
 * @returns Rule and reason of the skip, or null when the mutant is emitted.
 */
function getDropSkip(
  node: PrivateInExpression | BinaryExpression,
  context: MutatorContext,
): SkipNote | null {
  let { syntax } = context
  let right = syntax.unwrapExpression(node.right)
  if (syntax.isErrorMessage(node)) {
    return {
      reason: 'the text of an error message is not worth a test',
      rule: 'error-message',
    }
  }
  if (
    typeof getLiteralValue(right) === 'string' &&
    !syntax.isTimerDelay(node)
  ) {
    return {
      reason: "dropping a string operand is string-literal's emptying of it",
      by: { mutator: 'string-literal', node: right },
      rule: 'O11',
    }
  }
  return null
}

/**
 * Tells whether the right operand of a `+` or `-` is a unary `-` that
 * unary-operator removes (catalog 5.2 O14): `b - -c` swapped to `b + -c` is the
 * program of `-c` turned into `c`.
 *
 * @param operator - Operator of the arithmetic expression.
 * @param right - Right operand, through wrappers.
 * @returns Whether the swap belongs to unary-operator.
 */
function isOperandNegation(operator: string, right: Node): boolean {
  return (
    (operator === '+' || operator === '-') &&
    right.type === 'UnaryExpression' &&
    right.operator === '-' &&
    getLiteralValue(right) === null
  )
}
