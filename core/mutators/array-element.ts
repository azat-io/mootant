import type { ArrayExpression } from 'oxc-parser'

import type { MutatorContext } from '../../types/mutator/mutator-context'
import type { Replacement } from '../../types/mutator/replacement'
import type { Mutator } from '../../types/mutator/mutator'

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
 * holes get nothing; the `[undefined]` of the empty dependency list of a React
 * hook, and of an array that is only pushed to and joined with an empty
 * separator (see `isJoinedArray`), follows as a skipped replacement when the
 * name `undefined` surely holds the global value (see `isGlobalName`): a
 * parameter, a local or a declaration that another script block of a component
 * makes may give it any value.
 */
export let arrayElement: Mutator = {
  create(context) {
    let { sourceCode, syntax } = context
    return {
      ArrayExpression(node) {
        let { elements } = node
        if (elements.includes(null)) {
          return []
        }
        if (elements.length === 0) {
          let replacement: Replacement = { text: '[undefined]', node }
          if (!syntax.isGlobalName('undefined')) {
            return [replacement]
          }
          if (isHookDependencies(node, context)) {
            replacement.skip = {
              reason:
                'an empty hook dependency list and [undefined] never change, so the hook behaves the same',
              rule: 'hook-dependencies',
            }
          } else if (syntax.isJoinedArray(node)) {
            replacement.skip = {
              reason:
                "the array is only pushed to and joined with '', which writes undefined as an empty string",
              rule: 'joined-array',
            }
          }
          return [replacement]
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
