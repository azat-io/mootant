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
 * Kind of the default that return-value writes in place of a returned value: a
 * type of the catalog's view, or `void` for a function whose result is not
 * used.
 */
export type ReturnValueKind = TypeView['type'] | 'void'

/**
 * Annotations of a function whose result is not used.
 */
let voidAnnotations = new Set([
  'TSUndefinedKeyword',
  'TSNeverKeyword',
  'TSVoidKeyword',
])

/**
 * Finds the kind of a returned value for return-value (catalog 4.14): the type
 * of the expression; when unknown, the type of the function's return annotation
 * (`Promise<T>` unwrapped for async functions, a type predicate is `boolean`);
 * `boolean` for a predicate callback; and `void` when the annotation is `void`,
 * `undefined`, `never`, `Promise<void>` or an assertion signature.
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
  let { type } = getTypeView(hints.getType(unwrapExpression(node)))
  return type === 'unknown' && annotated !== null ? annotated : type
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
