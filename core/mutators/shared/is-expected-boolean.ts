import type {
  Function as FunctionNode,
  ArrowFunctionExpression,
  Node,
} from 'oxc-parser'

import type { MutatorContext } from '../../../types/mutator/mutator-context'

/**
 * Tells whether an expression sits where its annotation expects a boolean
 * (catalog 2.2, `EB`): the returned value of a function annotated to return
 * `boolean`, a type predicate or, when async, `Promise<boolean>`; or the
 * initializer of a variable, a class field or a parameter default whose binding
 * is annotated `boolean`.
 *
 * @param node - Expression of the runtime tree.
 * @param context - Mutator context of the file.
 * @returns Whether a boolean is expected at the position of the expression.
 */
export function isExpectedBoolean(
  node: Node,
  context: MutatorContext,
): boolean {
  let { parent, key } = context.syntax.getContextSlot(node)
  switch (parent?.type) {
    case 'ArrowFunctionExpression':
      return key === 'body' && returnsBoolean(parent)
    case 'PropertyDefinition':
      return key === 'value' && isBooleanAnnotation(parent)
    case 'VariableDeclarator':
      return key === 'init' && isBooleanAnnotation(parent.id)
    case 'AssignmentPattern':
      return key === 'right' && isBooleanAnnotation(parent.left)
    case 'ReturnStatement': {
      let enclosing = context.syntax.getEnclosingFunction(parent)
      return enclosing !== null && returnsBoolean(enclosing)
    }
    default:
      return false
  }
}

/**
 * Tells whether a function's return annotation is `boolean`, a type predicate
 * that is not an assertion, or `Promise<boolean>` for an async function.
 *
 * @param node - Function or arrow function.
 * @returns Whether the function is declared to return a boolean.
 */
function returnsBoolean(node: ArrowFunctionExpression | FunctionNode): boolean {
  let annotation = node.returnType?.typeAnnotation
  switch (annotation?.type) {
    case 'TSBooleanKeyword':
      return true
    case 'TSTypeReference': {
      let [argument] = annotation.typeArguments?.params ?? []
      return (
        node.async &&
        annotation.typeName.type === 'Identifier' &&
        annotation.typeName.name === 'Promise' &&
        argument?.type === 'TSBooleanKeyword'
      )
    }
    case 'TSTypePredicate':
      return !annotation.asserts
    default:
      return false
  }
}

/**
 * Tells whether a binding or a class field is annotated `boolean`.
 *
 * @param node - Binding pattern or class field.
 * @returns Whether its type annotation is the `boolean` keyword.
 */
function isBooleanAnnotation(node: Node): boolean {
  return (
    'typeAnnotation' in node &&
    node.typeAnnotation?.type === 'TSTypeAnnotation' &&
    node.typeAnnotation.typeAnnotation.type === 'TSBooleanKeyword'
  )
}
