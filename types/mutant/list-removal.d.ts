import type { ObjectExpression, ArrayExpression } from 'oxc-parser'

import type { MutantKind } from './mutant-kind'

/**
 * Removal of one element of an array literal or one member of an object
 * literal, which a mutator asks for with an empty replacement text.
 */
export interface ListRemoval {
  /**
   * Kind of the narrowed removal: `element` in an array, `property` in an
   * object.
   */
  kind: Extract<MutantKind, 'property' | 'element'>

  /**
   * Literal the element or member is removed from.
   */
  list: ObjectExpression | ArrayExpression

  /**
   * Whether the removal is narrowed to the element and hosted with the other
   * removals of its literal; false when it replaces the whole literal: for
   * every element of an array with a hole, for a member that a spread would
   * change, such as an accessor, and for every removal in a Svelte template.
   */
  narrow: boolean

  /**
   * Number of elements or members of the literal whose removal is not narrowed,
   * each of which takes a copy of the whole literal.
   */
  copies: number

  /**
   * Position of the element or member in the literal.
   */
  index: number
}
