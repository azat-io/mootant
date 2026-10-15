import type { RegisteredMutator } from './registered-mutator'
import type { Preset } from '../config/preset'

/**
 * Every mutator and preset of the loaded plugins, keyed by full id.
 */
export interface MutatorRegistry {
  /**
   * Mutators in canonical order.
   */
  mutators: Map<string, RegisteredMutator>

  /**
   * Presets keyed by `name` (core) or `namespace/name`.
   */
  presets: Map<string, Preset>
}
