import type { Node } from 'oxc-parser'

import type { Binding } from './binding'

/**
 * What a count map holds: the values its `set` calls store and the names that
 * take its values in `for...of` loops over it.
 */
export interface CountMap {
  /**
   * Second names of the `for (const [key, value] of map)` loops over the map
   * that nothing writes.
   */
  entries: Binding[]

  /**
   * Values that the `set` calls of the map store, in source order.
   */
  values: Node[]
}
