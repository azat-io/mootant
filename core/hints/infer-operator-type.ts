import type {
  AssignmentExpression,
  PrivateInExpression,
  LogicalExpression,
  BinaryExpression,
  UpdateExpression,
  UnaryExpression,
} from 'oxc-parser'

import type { TypeInference } from '../../types/hints/type-inference'
import type { InferredType } from '../../types/hints/inferred-type'
import type { ValueKind } from '../../types/hints/value-kind'

import { isComparisonOperator } from '../syntax/is-comparison-operator'
import { unionInferredTypes } from './union-inferred-types'
import { createInferredType } from './create-inferred-type'

/**
 * Expression whose value an operator computes.
 */
type OperatorExpression =
  | AssignmentExpression
  | PrivateInExpression
  | LogicalExpression
  | BinaryExpression
  | UpdateExpression
  | UnaryExpression

/**
 * Primitive kinds that `ToPrimitive` can produce for each kind, as used by `+`
 * and the numeric operators. A plain object may convert to any of them through
 * `valueOf` or `Symbol.toPrimitive`.
 */
let primitiveKinds = new Map<ValueKind, readonly ValueKind[]>([
  ['object', ['bigint', 'boolean', 'null', 'number', 'string', 'undefined']],
  ['undefined', ['undefined']],
  ['function', ['string']],
  ['boolean', ['boolean']],
  ['promise', ['string']],
  ['string', ['string']],
  ['number', ['number']],
  ['bigint', ['bigint']],
  ['symbol', ['symbol']],
  ['array', ['string']],
  ['null', ['null']],
])

/**
 * Primitive kinds that `+` adds as numbers.
 */
let numericAddends = new Set<ValueKind>([
  'undefined',
  'boolean',
  'number',
  'null',
])

/**
 * Kinds that have falsy values, which `&&` can give from its left side.
 */
let falsyCapableKinds = new Set<ValueKind>([
  'undefined',
  'boolean',
  'number',
  'string',
  'bigint',
  'null',
])

/**
 * Infers the result of a unary, update, binary, logical or assignment
 * expression. The operand of a numeric operator is taken to be a number when
 * its type is unknown.
 *
 * @param node - Operator expression.
 * @param inference - Recursion context of the provider.
 * @returns Kinds of the result, or unknown.
 */
export function inferOperatorType(
  node: OperatorExpression,
  inference: TypeInference,
): InferredType {
  switch (node.type) {
    case 'AssignmentExpression':
      return inferAssignmentType(node, inference)
    case 'LogicalExpression':
      return inferLogicalType(
        node.operator,
        inference.infer(node.left),
        inference.infer(node.right),
      )
    case 'BinaryExpression':
      return inferBinaryType(
        node.operator,
        inference.infer(node.left),
        inference.infer(node.right),
      )
    case 'UpdateExpression':
      return inferNumericType(inference.infer(node.argument))
    default:
      return inferUnaryType(node, inference)
  }
}

/**
 * Infers a binary operator from the types of its operands.
 *
 * @param operator - Binary operator, also the operator of a compound
 *   assignment.
 * @param left - Type of the left operand.
 * @param right - Type of the right operand.
 * @returns Kinds of the result, or unknown.
 */
function inferBinaryType(
  operator: string,
  left: InferredType,
  right: InferredType,
): InferredType {
  if (isComparisonOperator(operator)) {
    return createInferredType(['boolean'])
  }
  if (operator === '+') {
    return inferAdditionType(left, right)
  }
  if (operator === '>>>' || left.kinds === null || right.kinds === null) {
    return createInferredType(['number'])
  }
  let leftPrimitives = getPrimitiveKinds(left.kinds)
  let rightPrimitives = getPrimitiveKinds(right.kinds)
  let kinds: ValueKind[] = []
  if (leftPrimitives.has('bigint') && rightPrimitives.has('bigint')) {
    kinds.push('bigint')
  }
  if (hasNonBigInt(leftPrimitives) && hasNonBigInt(rightPrimitives)) {
    kinds.push('number')
  }
  return createInferredType(kinds)
}

/**
 * Infers `a + b`: a string when either side is only a string; otherwise, with
 * both sides known, a string when either side can convert to one, a number when
 * both can add numerically, and a BigInt when both can be one.
 *
 * @param left - Type of the left operand.
 * @param right - Type of the right operand.
 * @returns Kinds of the sum, or unknown.
 */
function inferAdditionType(
  left: InferredType,
  right: InferredType,
): InferredType {
  if (isOnlyString(left) || isOnlyString(right)) {
    return createInferredType(['string'])
  }
  if (left.kinds === null || right.kinds === null) {
    return createInferredType(null)
  }
  let leftPrimitives = getPrimitiveKinds(left.kinds)
  let rightPrimitives = getPrimitiveKinds(right.kinds)
  let kinds: ValueKind[] = []
  if (leftPrimitives.has('string') || rightPrimitives.has('string')) {
    kinds.push('string')
  }
  if (hasNumericAddend(leftPrimitives) && hasNumericAddend(rightPrimitives)) {
    kinds.push('number')
  }
  if (leftPrimitives.has('bigint') && rightPrimitives.has('bigint')) {
    kinds.push('bigint')
  }
  return createInferredType(kinds)
}

/**
 * Infers an assignment: `=` gives the right side, a compound assignment the
 * binary operator's result, a logical assignment either side.
 *
 * @param node - Assignment expression.
 * @param inference - Recursion context of the provider.
 * @returns Kinds of the assigned value, or unknown.
 */
function inferAssignmentType(
  node: AssignmentExpression,
  inference: TypeInference,
): InferredType {
  let { operator, right } = node
  let rightType = inference.infer(right)
  if (operator === '=') {
    return rightType
  }
  let leftType = inference.infer(node.left)
  let binaryOperator = operator.slice(0, -1)
  if (['&&', '||', '??'].includes(binaryOperator)) {
    return unionInferredTypes([leftType, rightType])
  }
  return inferBinaryType(binaryOperator, leftType, rightType)
}

/**
 * Infers a unary operator.
 *
 * @param node - Unary expression.
 * @param inference - Recursion context of the provider.
 * @returns Kinds of the result.
 */
function inferUnaryType(
  node: UnaryExpression,
  inference: TypeInference,
): InferredType {
  switch (node.operator) {
    case 'delete':
    case '!':
      return createInferredType(['boolean'])
    case 'typeof':
      return createInferredType(['string'])
    case 'void':
      return createInferredType(['undefined'])
    case '+':
      return createInferredType(['number'])
    default:
      return inferNumericType(inference.infer(node.argument))
  }
}

/**
 * Infers `a && b`, `a || b` and `a ?? B`.
 *
 * @param operator - One of `&&`, `||` and `??`.
 * @param left - Type of the left operand.
 * @param right - Type of the right operand.
 * @returns The kinds of the left side that the operator can give, plus the
 *   kinds of the right side; unknown when either side is unknown.
 */
function inferLogicalType(
  operator: '&&' | '||' | '??',
  left: InferredType,
  right: InferredType,
): InferredType {
  if (left.kinds === null || right.kinds === null) {
    return createInferredType(null)
  }
  let kept = left.kinds.filter(kind =>
    operator === '&&' ?
      falsyCapableKinds.has(kind)
    : kind !== 'null' && kind !== 'undefined',
  )
  return createInferredType([...kept, ...right.kinds])
}

/**
 * Infers `-x`, `~x` and the update operators from the operand.
 *
 * @param operand - Type of the value that is negated, inverted or updated.
 * @returns `bigint` when the operand can only convert to a BigInt, `bigint` and
 *   `number` when it can convert to a BigInt or another primitive, and `number`
 *   otherwise, also for an unknown operand.
 */
function inferNumericType(operand: InferredType): InferredType {
  if (operand.kinds === null) {
    return createInferredType(['number'])
  }
  let primitives = getPrimitiveKinds(operand.kinds)
  if (!primitives.has('bigint')) {
    return createInferredType(['number'])
  }
  return createInferredType(
    hasNonBigInt(primitives) ? ['bigint', 'number'] : ['bigint'],
  )
}

/**
 * Lists the primitive kinds that the values of a type can convert to.
 *
 * @param kinds - Kinds of a known type.
 * @returns The kinds `ToPrimitive` can produce for them.
 */
function getPrimitiveKinds(kinds: readonly ValueKind[]): Set<ValueKind> {
  let primitives = new Set<ValueKind>()
  for (let kind of kinds) {
    for (let primitive of primitiveKinds.get(kind)!) {
      primitives.add(primitive)
    }
  }
  return primitives
}

/**
 * Tells whether a set of primitive kinds has a kind that `+` adds as a number.
 *
 * @param primitives - Primitive kinds of an operand.
 * @returns Whether a number, boolean, null or undefined is among them.
 */
function hasNumericAddend(primitives: Set<ValueKind>): boolean {
  for (let primitive of primitives) {
    if (numericAddends.has(primitive)) {
      return true
    }
  }
  return false
}

/**
 * Tells whether a set of primitive kinds has a kind other than BigInt.
 *
 * @param primitives - Primitive kinds of an operand.
 * @returns Whether any kind is not `bigint`.
 */
function hasNonBigInt(primitives: Set<ValueKind>): boolean {
  return primitives.size > (primitives.has('bigint') ? 1 : 0)
}

/**
 * Tells whether a type is known to be only a string.
 *
 * @param type - Type of an operand.
 * @returns Whether the only kind is `string`.
 */
function isOnlyString(type: InferredType): boolean {
  return type.kinds?.length === 1 && type.kinds[0] === 'string'
}
