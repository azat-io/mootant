import type { Node } from 'oxc-parser'

import type { TypeInference } from '../../types/type-inference'
import type { InferredType } from '../../types/inferred-type'
import type { ValueKind } from '../../types/value-kind'

import { inferAnnotationType } from './infer-annotation-type'
import { unwrapExpression } from '../tree/unwrap-expression'
import { unionInferredTypes } from './union-inferred-types'
import { createInferredType } from './create-inferred-type'
import { getMemberPath } from '../syntax/get-member-path'
import { inferOperatorType } from './infer-operator-type'
import { inferBindingType } from './infer-binding-type'
import { getAssertedType } from './get-asserted-type'
import { inferMemberType } from './infer-member-type'
import { inferThisType } from './infer-this-type'
import { inferCallType } from './infer-call-type'

/**
 * Kinds of global names that are not declared in the file.
 */
let globalNames = new Map<string, ValueKind>([
  ['undefined', 'undefined'],
  ['globalThis', 'object'],
  ['Infinity', 'number'],
  ['NaN', 'number'],
])

/**
 * Kinds of the values that `new` gives for global constructors other than plain
 * objects.
 */
let constructedKinds = new Map<string, ValueKind>([
  ['Function', 'function'],
  ['Promise', 'promise'],
  ['Array', 'array'],
])

/**
 * Kinds whose values are never thenable, so awaiting them gives them back. An
 * object or a function may have a `then` method, and a promise resolves to
 * another value.
 */
let settledKinds = new Set<ValueKind>([
  'undefined',
  'boolean',
  'string',
  'number',
  'bigint',
  'symbol',
  'array',
  'null',
])

/**
 * Infers the kinds of an expression from its syntax: literals, wrappers,
 * operators, calls, members and same-file names.
 *
 * @param node - Expression of the runtime tree.
 * @param inference - Recursion context of the provider.
 * @returns Kinds of the values the expression can have, or unknown.
 */
export function inferExpressionType(
  node: Node,
  inference: TypeInference,
): InferredType {
  switch (node.type) {
    case 'TSInstantiationExpression':
    case 'ParenthesizedExpression':
      return inference.infer(node.expression)
    case 'TaggedTemplateExpression':
      return createInferredType(
        getMemberPath(node.tag)?.join('.') === 'String.raw' ? ['string'] : null,
      )
    case 'ArrowFunctionExpression':
    case 'FunctionExpression':
    case 'ClassExpression':
      return createInferredType(['function'])
    case 'TSSatisfiesExpression': {
      let type = inference.infer(node.expression)
      return type.kinds === null ?
          inferAnnotationType(node.typeAnnotation, inference)
        : type
    }
    case 'ConditionalExpression':
      return unionInferredTypes([
        inference.infer(node.consequent),
        inference.infer(node.alternate),
      ])
    case 'AssignmentExpression':
    case 'LogicalExpression':
    case 'BinaryExpression':
    case 'UpdateExpression':
    case 'UnaryExpression':
      return inferOperatorType(node, inference)
    case 'TSNonNullExpression':
      return removeNullish(inference.infer(node.expression))
    case 'SequenceExpression':
      return inference.infer(node.expressions.at(-1)!)
    case 'ObjectExpression':
    case 'JSXFragment':
    case 'JSXElement':
      return createInferredType(['object'])
    case 'MemberExpression':
      return inferMemberType(node, inference)
    case 'ImportExpression':
      return createInferredType(['promise'])
    case 'TSTypeAssertion':
    case 'TSAsExpression':
      return inferAssertionType(node, inference)
    case 'ChainExpression':
      return unionInferredTypes([
        inference.infer(node.expression),
        createInferredType(['undefined']),
      ])
    case 'AwaitExpression': {
      let { kinds } = inference.infer(node.argument)
      return createInferredType(
        kinds?.every(kind => settledKinds.has(kind)) ? kinds : null,
      )
    }
    case 'TemplateLiteral':
      return createInferredType(['string'])
    case 'ArrayExpression':
      return createInferredType(['array'])
    case 'CallExpression':
      return inferCallType(node, inference)
    case 'ThisExpression':
      return inferThisType(node, inference)
    case 'NewExpression':
      return inferConstructedType(node.callee)
    case 'MetaProperty':
      return createInferredType(node.meta.name === 'import' ? ['object'] : null)
    case 'Identifier':
      return inferIdentifierType(node, inference)
    case 'Literal':
      return inferLiteralType(node)
    default:
      return createInferredType(null)
  }
}

/**
 * Infers a literal from its value.
 *
 * @param node - String, number, BigInt, boolean, null or regular expression
 *   literal.
 * @returns The kind of the value; a regular expression is an object.
 */
function inferLiteralType(
  node: Extract<Node, { type: 'Literal' }>,
): InferredType {
  if ('regex' in node) {
    return createInferredType(['object'])
  }
  let { value } = node
  switch (typeof value) {
    case 'boolean':
      return createInferredType(['boolean'])
    case 'string':
      return createInferredType(['string'])
    case 'number':
      return createInferredType(['number'])
    case 'bigint':
      return createInferredType(['bigint'])
    default:
      return createInferredType(['null'])
  }
}

/**
 * Infers an `as` expression or a `<T>x` assertion: the asserted type when it is
 * known, otherwise the operand's type; `as const` keeps the operand's type.
 *
 * @param node - `as` expression or angle-bracket assertion.
 * @param inference - Recursion context of the provider.
 * @returns Kinds of the asserted value, or unknown.
 */
function inferAssertionType(
  node: Extract<Node, { type: 'TSTypeAssertion' | 'TSAsExpression' }>,
  inference: TypeInference,
): InferredType {
  let asserted = getAssertedType(node)
  if (asserted) {
    let type = inferAnnotationType(asserted, inference)
    if (type.kinds !== null) {
      return type
    }
  }
  return inference.infer(node.expression)
}

/**
 * Infers an identifier from the declaration it resolves to, or from the few
 * globals with a fixed type.
 *
 * @param node - Identifier used as an expression.
 * @param inference - Recursion context of the provider.
 * @returns Kinds of the named value, or unknown.
 */
function inferIdentifierType(
  node: Extract<Node, { type: 'Identifier' }>,
  inference: TypeInference,
): InferredType {
  let binding = inference.scopes.bindings.get(node)
  if (binding) {
    return inferBindingType(binding, inference)
  }
  let kind = globalNames.get(node.name)
  return createInferredType(kind ? [kind] : null)
}

/**
 * Infers the value of a `new` expression from its callee.
 *
 * @param callee - Constructor expression.
 * @returns `array`, `promise` or `function` for those global constructors,
 *   otherwise `object`.
 */
function inferConstructedType(callee: Node): InferredType {
  let constructor = unwrapExpression(callee)
  let kind =
    constructor.type === 'Identifier' ?
      constructedKinds.get(constructor.name)
    : undefined
  return createInferredType([kind ?? 'object'])
}

/**
 * Removes `null` and `undefined` from a type.
 *
 * @param type - Type to narrow.
 * @returns The type without nullish kinds; unknown stays unknown, and a type
 *   that was only nullish becomes unknown.
 */
function removeNullish(type: InferredType): InferredType {
  return createInferredType(
    type.kinds?.filter(kind => kind !== 'null' && kind !== 'undefined') ?? null,
  )
}
