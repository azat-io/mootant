import type { Node } from 'oxc-parser'

import type { AnalyzedProgram } from '../../types/syntax/analyzed-program'
import type { TreeIndex } from '../../types/syntax/tree-index'

import { getClosedInitializer } from './get-closed-initializer'
import { unwrapExpression } from '../tree/unwrap-expression'
import { getContextSlot } from '../tree/get-context-slot'
import { isResultUnused } from './is-result-unused'
import { isGlobalName } from './is-global-name'

/**
 * Methods of a Map or a Set that read it or remove entries, and return
 * something other than the collection.
 */
let readMethods = new Set([
  'entries',
  'delete',
  'values',
  'clear',
  'keys',
  'get',
  'has',
])

/**
 * Methods of a Map or a Set that store an entry and return the collection.
 */
let storeMethods = new Set(['add', 'set'])

/**
 * Finds the built-in class of an expression that is always a `Map` or a `Set`
 * whose `size` no code can change: a `new Map(...)` or `new Set(...)` whose
 * callee is the global name, directly or as the initializer that always gives a
 * name its value (see `getFixedInitializer`). The callee counts only when the
 * name surely refers to the global anywhere in the program (see
 * `isGlobalName`): another body of a TypeScript namespace may export a `Map`
 * that the bare name reads, and `eval`, a `with` object or another script block
 * of a component may supply one where the scope analysis does not see it. A
 * name counts only when the program holds its every read and each read is a
 * node of the runtime tree (see `getClosedInitializer`) that reads `size`;
 * calls `get`, `has`, `delete`, `clear`, `keys`, `values` or `entries`, or
 * `add` or `set` with the result, the collection itself, unused; is the
 * iterable of a `for...of` loop; or is a spread element of an array literal.
 * Any other read, such as an argument, a `forEach` call, whose callback
 * receives the collection, or a write of a member, lets code reach the
 * collection and give it a `size` of its own. The built-in classes are assumed
 * not to be patched.
 *
 * @param program - Runtime tree, scope analysis and shared scopes of the
 *   program.
 * @param node - Expression to check.
 * @returns `Map` or `Set`, or null when the expression is not always such a
 *   collection.
 */
export function getCollectionClass(
  program: AnalyzedProgram,
  node: Node,
): 'Map' | 'Set' | null {
  let current = unwrapExpression(node)
  if (current.type === 'Identifier') {
    let binding = program.scopes.bindings.get(current)
    let initializer =
      binding && getClosedInitializer(program, binding, readsCollection)
    if (!initializer) {
      return null
    }
    current = unwrapExpression(initializer)
  }
  if (current.type !== 'NewExpression') {
    return null
  }
  let callee = unwrapExpression(current.callee)
  return (
      callee.type === 'Identifier' &&
        (callee.name === 'Map' || callee.name === 'Set') &&
        isGlobalName(program, callee.name)
    ) ?
      callee.name
    : null
}

/**
 * Tells whether a reference to a Map or a Set only reads it or changes its
 * entries, through parentheses and TypeScript wrappers.
 *
 * @param tree - Runtime tree of the program.
 * @param reference - Identifier that refers to the collection, in the runtime
 *   tree.
 * @returns Whether no code reaches the collection through the reference.
 */
function readsCollection(tree: TreeIndex, reference: Node): boolean {
  let { parent, key } = getContextSlot(tree, reference)
  switch (parent?.type) {
    case 'MemberExpression': {
      if (
        key !== 'object' ||
        parent.computed ||
        parent.property.type !== 'Identifier'
      ) {
        return false
      }
      let { name } = parent.property
      let call = getContextSlot(tree, parent)
      return (
        name === 'size' ||
        (call.key === 'callee' &&
          call.parent?.type === 'CallExpression' &&
          (readMethods.has(name) ||
            (storeMethods.has(name) && isResultUnused(tree, call.parent))))
      )
    }
    case 'ForOfStatement':
      return key === 'right'
    case 'SpreadElement':
      return getContextSlot(tree, parent).parent?.type === 'ArrayExpression'
    default:
      return false
  }
}
