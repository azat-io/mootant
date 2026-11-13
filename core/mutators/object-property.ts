import type { Mutator } from '../../types/mutator/mutator'

import { getDefaultOptionSkip } from './shared/get-default-option-skip'

/**
 * Removes one property or spread from an object literal (catalog 4.12): the
 * replacement of a member with an empty text, which removes it with its comma.
 * Each removal (T6) is solitary over the removed member, so the pipeline drops
 * it while a mutant inside the member will run. Removing an option of an `Intl`
 * constructor that holds the default value is skipped as equivalent
 * (`getDefaultOptionSkip`).
 */
export let objectProperty: Mutator = {
  create(context) {
    return {
      ObjectExpression(node) {
        return node.properties.map(property => {
          let skip = getDefaultOptionSkip(property, node, context)
          return {
            ...(skip && { skip }),
            solitary: [property],
            node: property,
            text: '',
          }
        })
      },
    }
  },
  meta: {
    description: 'Removes one property or spread from an object literal.',
  },
}
