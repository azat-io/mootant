import type { Mutator } from '../../types/mutator/mutator'

/**
 * Removes one property or spread from an object literal (catalog 4.12). Each
 * removal (T6) is solitary over the removed member, so the pipeline drops it
 * while a mutant inside the member will run.
 */
export let objectProperty: Mutator = {
  create(context) {
    let { sourceCode } = context
    return {
      ObjectExpression(node) {
        return node.properties.map((property, index) => ({
          text: sourceCode.removeListElement(node, index),
          solitary: [property],
          node,
        }))
      },
    }
  },
  meta: {
    description: 'Removes one property or spread from an object literal.',
  },
}
