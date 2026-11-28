import type { SkipRule } from '../mutant/skip-rule'
import type { Mutator } from '../mutator/mutator'
import type { Preset } from './preset'

/**
 * Package of mutators, presets and skip rules. Built-in mutators form the core
 * plugin; other plugins get a namespace that prefixes their ids.
 */
export interface Plugin {
  /**
   * Rules that the skips of the plugin's mutators name, keyed by kebab-case
   * name; reports give a rule the id `namespace/name`. A skip may also name a
   * built-in rule that the plugin does not declare. The core plugin has none:
   * its mutators name the built-in rules.
   */
  skipRules?: Record<string, SkipRule>

  /**
   * Mutators keyed by kebab-case name.
   */
  mutators: Record<string, Mutator>

  /**
   * Presets keyed by kebab-case name.
   */
  presets?: Record<string, Preset>
}
