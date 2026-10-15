import type { RegisteredMutator } from './registered-mutator'

/**
 * Mutator a preset turned on, with its resolved options.
 */
export interface ActiveMutator extends RegisteredMutator {
  /**
   * Preset options merged over `meta.defaultOptions`, frozen.
   */
  options: Readonly<object>
}
