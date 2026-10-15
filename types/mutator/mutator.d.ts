import type { MutatorVisitors } from './mutator-visitors'
import type { MutatorContext } from './mutator-context'
import type { MutatorMeta } from './mutator-meta'

/**
 * Module that turns nodes of a file into replacements, shaped like an ESLint
 * rule.
 */
export interface Mutator<Options extends object = object> {
  /**
   * Creates the visitors for one file. Mootant calls it once per file, so the
   * visitors may keep state for that file in the closure.
   */
  create(context: MutatorContext<Options>): MutatorVisitors

  /**
   * Description, default options and solitary rule participation.
   */
  meta: MutatorMeta<Options>
}
