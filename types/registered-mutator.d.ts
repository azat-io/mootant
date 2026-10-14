import type { Mutator } from './mutator'

/**
 * Mutator known to the registry.
 */
export interface RegisteredMutator {
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
