import type { Node } from 'oxc-parser'

import type { AnalyzedProgram } from '../../types/syntax/analyzed-program'
import type { TreeIndex } from '../../types/syntax/tree-index'

import { getClosedInitializer } from './get-closed-initializer'
import { unwrapExpression } from '../tree/unwrap-expression'
import { getContextSlot } from '../tree/get-context-slot'
import { isResultUnused } from './is-result-unused'

/**
 * Tells whether an array literal only collects the parts of a string that
 * `join('')` builds (catalog 4.2, N4): the array is, through parentheses and
 * TypeScript wrappers, the initializer that always gives a name its value; the
 * program holds every read of the name; and every reference is a node of the
 * runtime tree (see `getClosedInitializer`) that calls `push` on the name, with
 * the result unused, or `join` with one argument, an empty string literal or
 * template, at least one being the `join`. `join` writes `undefined` as an
 * empty string, so an `undefined` element first builds the same strings. The
 * methods are the array's, since the name holds an array literal; the built-ins
 * are assumed not to be patched.
 *
 * @param program - Runtime tree, scope analysis and shared scopes of the
 *   program.
 * @param node - Array literal of the runtime tree.
 * @returns Whether an `undefined` element first changes no string the array
 *   builds.
 */
export function isJoinedArray(program: AnalyzedProgram, node: Node): boolean {
  let { scopes, tree } = program
  let { parent, key } = getContextSlot(tree, node)
  if (
    key !== 'init' ||
    parent?.type !== 'VariableDeclarator' ||
    parent.id.type !== 'Identifier'
  ) {
    return false
  }
  let binding = scopes.bindings.get(parent.id)!
  return (
    getClosedInitializer(program, binding, callsArray) !== null &&
    binding.references.some(
      reference => readArrayCall(tree, reference) === 'join',
    )
  )
}

/**
 * Reads the call that a reference of the array makes: `push` whose result is
 * unused, or `join` with one argument that is an empty string literal or
 * template, through parentheses and TypeScript wrappers.
 *
 * @param tree - Runtime tree of the program.
 * @param reference - Identifier that refers to the array, in the runtime tree.
 * @returns The method of the call, or null for any other use of the array.
 */
function readArrayCall(
  tree: TreeIndex,
  reference: Node,
): 'join' | 'push' | null {
  let member = getContextSlot(tree, reference)
  if (
    member.key !== 'object' ||
    member.parent?.type !== 'MemberExpression' ||
    member.parent.computed ||
    member.parent.property.type !== 'Identifier'
  ) {
    return null
  }
  let { name } = member.parent.property
  let call = getContextSlot(tree, member.parent)
  if (call.key !== 'callee' || call.parent?.type !== 'CallExpression') {
    return null
  }
  if (name === 'push') {
    return isResultUnused(tree, call.parent) ? 'push' : null
  }
  let [separator] = call.parent.arguments
  return (
      name === 'join' &&
        call.parent.arguments.length === 1 &&
        isEmptyString(separator!)
    ) ?
      'join'
    : null
}

/**
 * Tells whether an argument is an empty string literal or a template literal
 * without expressions or text, through parentheses and TypeScript wrappers.
 *
 * @param node - Argument of a call.
 * @returns Whether the argument is always the empty string.
 */
function isEmptyString(node: Node): boolean {
  let current = unwrapExpression(node)
  return (
    (current.type === 'Literal' && current.value === '') ||
    (current.type === 'TemplateLiteral' &&
      current.expressions.length === 0 &&
      current.quasis[0]!.value.cooked === '')
  )
}

/**
 * Tells whether a reference of the array pushes to it or joins it (see
 * `readArrayCall`).
 *
 * @param tree - Runtime tree of the program.
 * @param reference - Identifier that refers to the array, in the runtime tree.
 * @returns Whether the reference makes one of the calls that only build the
 *   string.
 */
function callsArray(tree: TreeIndex, reference: Node): boolean {
  return readArrayCall(tree, reference) !== null
}
