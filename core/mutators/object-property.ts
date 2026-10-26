import type { Mutator } from '../../types/mutator/mutator'

import { getDefaultOptionSkip } from './shared/get-default-option-skip'

/**
 * Removes one property or spread from an object literal (catalog 4.12). Each
 * removal (T6) is solitary over the removed member, so the pipeline drops it
 * while a mutant inside the member will run. Removing an option of an `Intl`
 * constructor that holds the default value is skipped as equivalent
 * (`getDefaultOptionSkip`).
 */
export let objectProperty: Mutator = {
  create(context) {
    let { sourceCode } = context
    return {
      ObjectExpression(node) {
        return node.properties.map((property, index) => {
          let skip = getDefaultOptionSkip(property, node, context)
          return {
            text: sourceCode.removeListElement(node, index),
            ...(skip && { skip }),
            solitary: [property],
            node,
          }
        })
      },
    }
  },
  meta: {
    description: 'Removes one property or spread from an object literal.',
  },
}
