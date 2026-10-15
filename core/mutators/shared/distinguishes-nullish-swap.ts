import type { Node } from 'oxc-parser'

import type { TypeHints } from '../../../types/hints/type-hints'

import { hasDefinedFalsyValue } from './has-defined-falsy-value'
import { isCanonicalFalsy } from './is-canonical-falsy'
import { getTypeView } from './get-type-view'

/**
 * Operands of `??`, `||`, `??=` or `||=`.
 */
interface NullishOperands {
  /**
   * Default value.
   */
  right: Node

  /**
   * Value or assignment target that decides whether the default applies.
   */
  left: Node
}

/**
 * Tells whether `??` and `||` give different results for some falsy value of
 * the left side that is not nullish and not already the default (catalog 3.3,
 * `swapDistinguishes`). A string, number, BigInt or boolean left side differs
 * unless the default is its only falsy value. An unknown left side differs when
 * the default is a string, number, BigInt or boolean other than `''`, `false`
 * and `0n`, because the default reveals the type of the slot (`0` is kept). The
 * `always` mode also accepts a number with the default `0` and an unknown left
 * side with a default that is not an object.
 *
 * @param operands - Left side and default of the expression.
 * @param hints - Type hints of the file.
 * @param mode - The `nullishSwap` option of the mutator.
 * @returns Whether the swap between `??` and `||` changes the behavior.
 */
export function distinguishesNullishSwap(
  operands: NullishOperands,
  hints: TypeHints,
  mode: 'distinguishing' | 'always',
): boolean {
  let { right, left } = operands
  let leftType = hints.getType(left)
  let leftView = getTypeView(leftType)
  if (hasDefinedFalsyValue(leftType)) {
    return (
      !isCanonicalFalsy(leftView.type, right) ||
      (mode === 'always' && leftView.type === 'number')
    )
  }
  if (leftView.type !== 'unknown') {
    return false
  }
  let rightView = getTypeView(hints.getType(right))
  if (mode === 'always') {
    return (
      rightView.type !== 'function' &&
      rightView.type !== 'object' &&
      rightView.type !== 'array'
    )
  }
  return (
    hasDefinedFalsyValue(hints.getType(right)) &&
    (rightView.type === 'number' || !isCanonicalFalsy(rightView.type, right))
  )
}
