import type {
  Function as FunctionNode,
  ArrowFunctionExpression,
  Node,
} from 'oxc-parser'

import type { MutatorContext } from '../../../types/mutator/mutator-context'
import type { TypeView } from './get-type-view'

import { unwrapExpression } from '../../tree/unwrap-expression'
import { getTypeView } from './get-type-view'

/**
 * Kind of a function that returns a `Promise<T>` without `async`: its default
 * is a promise resolved with an empty value that `T` allows.
 */
export interface PromiseKind {
  /**
   * Kind of the value the default resolves with: the kind of `T` when it has a
   * default of its own, a boolean, string, number, BigInt or array; `null` when
   * `T` otherwise holds `null` but not `undefined`; and `void` for any other
   * `T`, whose default resolves with `undefined`.
   */
  promise:
    'boolean' | 'string' | 'number' | 'bigint' | 'array' | 'null' | 'void'
}

/**
 * Kind of the default that return-value writes in place of a returned value: a
 * type of the catalog's view, `void` for a function whose result is not used,
 * or a promise for a function that returns a `Promise<T>` without `async`.
 */
export type ReturnValueKind = TypeView['type'] | PromiseKind | 'void'

/**
 * Kinds of `T` whose own default a promise default resolves with.
 */
let resolvedKinds = new Set<string>([
  'boolean',
  'string',
  'number',
  'bigint',
  'array',
])

/**
 * Annotations of a function whose result is not used.
 */
let voidAnnotations = new Set([
  'TSUndefinedKeyword',
  'TSNeverKeyword',
  'TSVoidKeyword',
])

/**
 * Finds the kind of a returned value for return-value (catalog 4.14): `void`
 * when the annotation is `void`, `undefined`, `never`, `Promise<void>` of an
 * async function or an assertion signature; `boolean` for a predicate callback,
 * whose caller tests the truth of the result, a promise too; a promise kind for
 * a function that returns the global `Promise<T>` without `async`, whatever the
 * value (see `PromiseKind`); otherwise the type of the expression, and when it
 * is unknown, the type of the return annotation (`Promise<T>` unwrapped for
 * async functions, a type predicate is `boolean`).
 *
 * @param node - Node of the runtime tree that is, through wrappers, the
 *   argument of a `return` or the concise body of an arrow function.
 * @param context - Mutator context of the file.
 * @returns The kind, or null when the node is not a returned value or the
 *   result of its function is not observed (a generator, a constructor or a
 *   setter).
 */
export function getReturnValueKind(
  node: Node,
  context: MutatorContext,
): ReturnValueKind | null {
  let { sourceCode, syntax, hints } = context
  let { parent, key } = syntax.getContextSlot(node)
  let enclosing =
    parent?.type === 'ReturnStatement' ?
      syntax.getEnclosingFunction(parent)
    : null
  if (key === 'body' && parent?.type === 'ArrowFunctionExpression') {
    enclosing = parent
  }
  let owner = enclosing ? sourceCode.getSlot(enclosing).parent : null
  if (
    !enclosing ||
    enclosing.generator ||
    (owner?.type === 'MethodDefinition' &&
      (owner.kind === 'constructor' || owner.kind === 'set')) ||
    (owner?.type === 'Property' && owner.kind === 'set')
  ) {
    return null
  }
  let annotated = getAnnotatedKind(enclosing, context)
  if (annotated === 'void') {
    return 'void'
  }
  if (syntax.isBooleanContext(node)) {
    return 'boolean'
  }
  let promise = getPromiseKind(enclosing, context)
  if (promise) {
    return promise
  }
  let { type } = getTypeView(hints.getType(unwrapExpression(node)))
  return type === 'unknown' && annotated !== null ? annotated : type
}

/**
 * Reads the promise kind of a function that returns a `Promise<T>` without
 * `async` (catalog 4.14). The annotation must name the global `Promise` (see
 * `isGlobalTypeName`), and the program must bind no value of that name (see
 * `isGlobalName`), so a default written as `Promise.resolve(…)` creates the
 * promise that the annotation names.
 *
 * @param node - Function or arrow function.
 * @param context - Mutator context of the file.
 * @returns The kind, or null for any other function.
 */
function getPromiseKind(
  node: ArrowFunctionExpression | FunctionNode,
  context: MutatorContext,
): PromiseKind | null {
  let annotation = node.returnType?.typeAnnotation
  if (
    node.async ||
    annotation?.type !== 'TSTypeReference' ||
    annotation.typeName.type !== 'Identifier' ||
    annotation.typeName.name !== 'Promise' ||
    !context.syntax.isGlobalTypeName(annotation.typeName) ||
    !context.syntax.isGlobalName('Promise')
  ) {
    return null
  }
  let result = annotation.typeArguments?.params[0]
  if (!result || voidAnnotations.has(result.type)) {
    return { promise: 'void' }
  }
  let inferred = context.hints.getAnnotationType(result)
  let { type } = getTypeView(inferred)
  if (resolvedKinds.has(type)) {
    return { promise: type as PromiseKind['promise'] }
  }
  let kinds = new Set(inferred.kinds ?? inferred.knownKinds)
  return {
    promise: kinds.has('null') && !kinds.has('undefined') ? 'null' : 'void',
  }
}

/**
 * Reads the kind that a function's return annotation gives.
 *
 * @param node - Function or arrow function.
 * @param context - Mutator context of the file.
 * @returns The kind, `void` for a result that is not used, or null without an
 *   annotation.
 */
function getAnnotatedKind(
  node: ArrowFunctionExpression | FunctionNode,
  context: MutatorContext,
): ReturnValueKind | null {
  let annotation = node.returnType?.typeAnnotation
  if (!annotation) {
    return null
  }
  if (annotation.type === 'TSTypePredicate') {
    return annotation.asserts ? 'void' : 'boolean'
  }
  if (
    node.async &&
    annotation.type === 'TSTypeReference' &&
    annotation.typeName.type === 'Identifier' &&
    annotation.typeName.name === 'Promise'
  ) {
    let [result] = annotation.typeArguments?.params ?? []
    if (!result || voidAnnotations.has(result.type)) {
      return 'void'
    }
    return getTypeView(context.hints.getAnnotationType(result)).type
  }
  if (voidAnnotations.has(annotation.type)) {
    return 'void'
  }
  return getTypeView(context.hints.getAnnotationType(annotation)).type
}
