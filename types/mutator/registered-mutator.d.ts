import type { RegisteredSkipRule } from '../mutant/registered-skip-rule'
import type { Mutator } from './mutator'

/**
 * Mutator known to the registry.
 */
export interface RegisteredMutator {
  /**
   * Skip rules of the plugin of the mutator, keyed by the name a skip gives,
   * each with its id `namespace/name`, which a skip names before the built-in
   * rules; omitted for a built-in mutator.
   */
  skipRules?: ReadonlyMap<string, RegisteredSkipRule>

  /**
   * Module that produces the replacements.
   */
  mutator: Mutator

  /**
   * Position in the canonical order: core mutators by name, then plugins by
   * namespace and their mutators by name. Breaks ordering and duplicate ties.
   */
  rank: number

  /**
   * Full id: `name` or `namespace/name`.
   */
  id: string
}
