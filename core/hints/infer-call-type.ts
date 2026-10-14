import type {
  Function as FunctionNode,
  ArrowFunctionExpression,
  VariableDeclarator,
  MemberExpression,
  CallExpression,
  Node,
} from 'oxc-parser'

import type { TypeInference } from '../../types/type-inference'
import type { InferredType } from '../../types/inferred-type'
import type { ValueKind } from '../../types/value-kind'
import type { Binding } from '../../types/binding'

import { unwrapParentheses } from '../tree/unwrap-parentheses'
import { inferAnnotationType } from './infer-annotation-type'
import { unwrapExpression } from '../tree/unwrap-expression'
import { unionInferredTypes } from './union-inferred-types'
import { createInferredType } from './create-inferred-type'
import { getMemberPath } from '../syntax/get-member-path'
import { WELL_KNOWN_CALLS } from './well-known-calls'
import { findThisClass } from './find-this-class'

/**
 * Methods that give an array when called on an array.
 */
let arrayMethods = new Set<string>([
  'toReversed',
  'toSpliced',
  'toSorted',
  'flatMap',
  'reverse',
  'filter',
  'concat',
  'slice',
  'with',
  'flat',
  'sort',
  'map',
])

/**
 * Result kinds of methods called on a string.
 */
let stringMethods = new Map<string, readonly ValueKind[]>([
  ['at', ['string', 'undefined']],
  ['concat', ['string']],
  ['slice', ['string']],
])

/**
 * Global functions that return their first argument.
 */
let firstArgumentCalls = new Set<string>([
  'Object.preventExtensions',
  'Object.defineProperties',
  'Object.setPrototypeOf',
  'Object.defineProperty',
  'Object.assign',
  'Object.freeze',
  'Object.seal',
])

/**
 * Kinds that `Object.assign` turns into an object wrapper.
 */
let primitiveKinds = new Set<ValueKind>([
  'boolean',
  'string',
  'number',
  'bigint',
  'symbol',
])

/**
 * Infers the result of a call, first match wins: a global that returns its
 * first argument, a well-known global callee, a method whose result follows its
 * receiver, a receiver-independent method name, and a same-file function or
 * method of the enclosing class.
 *
 * @param node - Call expression.
 * @param inference - Recursion context of the provider.
 * @returns Kinds of the result, or unknown, also for imported functions.
 */
export function inferCallType(
  node: CallExpression,
  inference: TypeInference,
): InferredType {
  let callee = unwrapExpression(node.callee)
  let path = getMemberPath(callee)
  if (path && !inference.scopes.bindings.has(getChainRoot(callee))) {
    let name = path.join('.')
    if (firstArgumentCalls.has(name)) {
      return inferFirstArgument(node, name, inference)
    }
    let kinds =
      WELL_KNOWN_CALLS.get(name) ??
      WELL_KNOWN_CALLS.get(`${path.slice(0, -1).join('.')}.*`)
    if (kinds) {
      return createInferredType(kinds)
    }
  }
  if (callee.type === 'Identifier') {
    return inferOverloadedResult(
      getDeclaredFunctions(inference.scopes.bindings.get(callee)),
      inference,
    )
  }
  if (callee.type === 'MemberExpression') {
    return inferMethodResult(callee, inference)
  }
  return createInferredType(null)
}

/**
 * Infers the result of a method call from the method name, the receiver's type,
 * or a method of the class that `this` refers to.
 *
 * @param callee - Member expression that is called.
 * @param inference - Recursion context of the provider.
 * @returns Kinds of the result, or unknown.
 */
function inferMethodResult(
  callee: MemberExpression,
  inference: TypeInference,
): InferredType {
  let { property, computed, object } = callee
  if (computed || property.type !== 'Identifier') {
    return createInferredType(null)
  }
  let { name } = property
  let receiver = inference.infer(object).kinds
  if (receiver?.length === 1) {
    let [kind] = receiver
    if (kind === 'array' && arrayMethods.has(name)) {
      return createInferredType(['array'])
    }
    let stringKinds = kind === 'string' ? stringMethods.get(name) : undefined
    if (stringKinds) {
      return createInferredType(stringKinds)
    }
  }
  let kinds = WELL_KNOWN_CALLS.get(`.${name}`)
  if (kinds) {
    return createInferredType(kinds)
  }
  if (unwrapParentheses(object).type !== 'ThisExpression') {
    return createInferredType(null)
  }
  let owner = findThisClass(inference.tree, callee)
  let methods = (owner?.body.body ?? []).flatMap(element =>
    (
      element.type === 'MethodDefinition' &&
      element.kind === 'method' &&
      element.static === owner!.isStatic &&
      !element.computed &&
      element.key.type === 'Identifier' &&
      element.key.name === name
    ) ?
      [element.value]
    : [],
  )
  return inferOverloadedResult(methods, inference)
}

/**
 * Lists the overload signatures of a function binding: the `declare function`
 * and overload statements with its name in the statements of its scope. A
 * function declared by its body alone, or whose signatures are not statements
 * of the scope, has its declaration only.
 *
 * @param binding - Binding of a function, declared by its first signature.
 * @returns The signatures, or the declaration.
 */
function getOverloads(binding: Binding): Node[] {
  let { declaration } = binding
  if (declaration.type !== 'TSDeclareFunction') {
    return [declaration]
  }
  let { name } = declaration.id!
  let signatures = getScopeStatements(binding.scope).flatMap(statement => {
    let inner =
      (
        statement.type === 'ExportNamedDeclaration' ||
        statement.type === 'ExportDefaultDeclaration'
      ) ?
        statement.declaration
      : statement
    return inner?.type === 'TSDeclareFunction' && inner.id?.name === name ?
        [inner]
      : []
  })
  return signatures.length > 0 ? signatures : [declaration]
}

/**
 * Infers the result of a global that returns its first argument.
 * `Object.assign` wraps a primitive target in an object and throws on a nullish
 * one.
 *
 * @param node - Call expression.
 * @param name - Path of the callee, such as `Object.assign`.
 * @param inference - Recursion context of the provider.
 * @returns Kinds of the first argument, or unknown when it is missing, spread
 *   or unknown, or when only a nullish target is possible.
 */
function inferFirstArgument(
  node: CallExpression,
  name: string,
  inference: TypeInference,
): InferredType {
  let [target] = node.arguments
  if (!target || target.type === 'SpreadElement') {
    return createInferredType(null)
  }
  let type = inference.infer(target)
  if (name !== 'Object.assign' || type.kinds === null) {
    return type
  }
  return createInferredType(
    type.kinds.flatMap(kind => {
      if (kind === 'null' || kind === 'undefined') {
        return []
      }
      return [primitiveKinds.has(kind) ? 'object' : kind]
    }),
  )
}

/**
 * Infers what calling a same-file function gives: its return annotation, a
 * promise for an `async` function, or an object for a generator.
 *
 * @param target - Function declaration or expression, the initializer of a
 *   `const`, or null.
 * @param inference - Recursion context of the provider.
 * @returns Kinds of the result, or unknown when the target is not a function or
 *   tells nothing.
 */
function inferFunctionResult(
  target: Node | null,
  inference: TypeInference,
): InferredType {
  let callable = target ? unwrapParentheses(target) : null
  if (!callable || !isFunction(callable)) {
    return createInferredType(null)
  }
  if (callable.returnType) {
    return inferAnnotationType(callable.returnType, inference)
  }
  if (callable.type !== 'ArrowFunctionExpression' && callable.generator) {
    return createInferredType(['object'])
  }
  return createInferredType(callable.async ? ['promise'] : null)
}

/**
 * Infers what calling a function that may be overloaded gives: the union of the
 * results of its overload signatures, never of one signature alone (the
 * arguments are not matched against them), or the result of its only
 * declaration.
 *
 * @param declarations - Declarations of the function in source order: overload
 *   signatures and the implementation, or a single function.
 * @param inference - Recursion context of the provider.
 * @returns Kinds of the result, or unknown.
 */
function inferOverloadedResult(
  declarations: readonly Node[],
  inference: TypeInference,
): InferredType {
  let signatures = declarations.filter(
    declaration =>
      declaration.type === 'TSEmptyBodyFunctionExpression' ||
      declaration.type === 'TSDeclareFunction',
  )
  if (signatures.length === 0) {
    return inferFunctionResult(declarations[0] ?? null, inference)
  }
  return unionInferredTypes(
    signatures.map(signature => inferFunctionResult(signature, inference)),
  )
}

/**
 * Lists the statements directly in the node that owns a scope.
 *
 * @param scope - Program, block, namespace body, static block, function, switch
 *   or loop head.
 * @returns The statements, those of every case for a switch, or nothing when
 *   the node holds no statement list.
 */
function getScopeStatements(scope: Node): readonly Node[] {
  if (scope.type === 'SwitchStatement') {
    return scope.cases.flatMap(switchCase => switchCase.consequent)
  }
  let statements: unknown = Reflect.get(
    isFunction(scope) ? scope.body! : scope,
    'body',
  )
  return Array.isArray(statements) ? (statements as Node[]) : []
}

/**
 * Tells whether a node is a function whose result can be read.
 *
 * @param node - Node to check.
 * @returns Whether the node is a function declaration or expression, an arrow
 *   function, a `declare function` or a method signature.
 */
function isFunction(
  node: Node,
): node is ArrowFunctionExpression | FunctionNode {
  switch (node.type) {
    case 'TSEmptyBodyFunctionExpression':
    case 'ArrowFunctionExpression':
    case 'FunctionDeclaration':
    case 'FunctionExpression':
    case 'TSDeclareFunction':
      return true
    default:
      return false
  }
}

/**
 * Finds the functions a called name may stand for.
 *
 * @param binding - Binding of the callee, or undefined for a global.
 * @returns Every signature of an overloaded function, the declaration of
 *   another function binding, the initializer of a `const`, or nothing.
 */
function getDeclaredFunctions(binding: undefined | Binding): Node[] {
  switch (binding?.kind) {
    case 'function':
      return getOverloads(binding)
    case 'const': {
      let { init } = binding.declaration as VariableDeclarator
      return init ? [init] : []
    }
    default:
      return []
  }
}

/**
 * Finds the expression at the root of a member chain.
 *
 * @param node - Identifier or member chain, without outer wrappers.
 * @returns The innermost object of the chain.
 */
function getChainRoot(node: Node): Node {
  let current = node
  while (
    current.type === 'MemberExpression' ||
    current.type === 'ChainExpression'
  ) {
    current = unwrapExpression(
      current.type === 'ChainExpression' ? current.expression : current.object,
    )
  }
  return current
}
