import type { Mutator } from './mutator'
import type { Preset } from './preset'

/**
 * Package of mutators and presets. Built-in mutators form the core plugin;
 * other plugins get a namespace that prefixes their ids.
 */
export interface Plugin {
  /**
   * Mutators keyed by kebab-case name.
   */
  mutators: Record<string, Mutator>

  /**
   * Presets keyed by kebab-case name.
   */
  presets?: Record<string, Preset>
}
