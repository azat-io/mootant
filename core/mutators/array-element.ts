import type { ArrayExpression } from 'oxc-parser'

import type { MutatorContext } from '../../types/mutator-context'
import type { Mutator } from '../../types/mutator'

import { getCalleeName } from '../tree/get-callee-name'

/**
 * Pattern of the names of React hooks, whose last argument may be a dependency
 * list.
 */
const HOOK_PATTERN = /^use[0-9A-Z]/u

/**
 * Removes one element from an array literal, or puts undefined into an empty
 * one (catalog 4.2). Each removal (T6) is solitary over the removed element, so
 * the pipeline drops it while a mutant inside the element will run. Arrays with
 * holes get nothing, and neither does the empty dependency list of a React
 * hook.
 */
export let arrayElement: Mutator = {
  create(context) {
    let { sourceCode } = context
    return {
      ArrayExpression(node) {
        let { elements } = node
        if (elements.includes(null)) {
          return []
        }
        if (elements.length === 0) {
          return isHookDependencies(node, context) ?
              []
            : [{ text: '[undefined]', node }]
        }
        return elements.map((element, index) => ({
          text: sourceCode.removeListElement(node, index),
          solitary: [element!],
          node,
        }))
      },
    }
  },
  meta: {
    description:
      'Removes one element from an array literal, or puts undefined into an empty one.',
  },
}

/**
 * Tells whether an empty array is the dependency list of a React hook (catalog
 * 4.2, EQ): the last of at least two arguments of a call whose callee name
 * starts with `use` and a capital letter or a digit. `[undefined]` never
 * changes either, so the hook behaves the same.
 *
 * @param node - Empty array literal.
 * @param context - Mutator context of the file.
 * @returns Whether the array is a hook dependency list.
 */
function isHookDependencies(
  node: ArrayExpression,
  context: MutatorContext,
): boolean {
  let { parent, index } = context.syntax.getContextSlot(node)
  if (
    parent?.type !== 'CallExpression' ||
    parent.arguments.length < 2 ||
    index !== parent.arguments.length - 1
  ) {
    return false
  }
  return HOOK_PATTERN.test(getCalleeName(parent.callee) ?? '')
}
