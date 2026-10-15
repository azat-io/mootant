import type { MutatorSetting } from './mutator-setting'
import type { PresetSettings } from './preset-settings'
import type { Plugin } from './plugin'

/**
 * Configuration file of a project. Its directory is the project root: display
 * paths and mutant ids are relative to it.
 */
export interface Config {
  /**
   * Settings keyed by mutator id, over those of the presets.
   */
  mutators?: Record<string, MutatorSetting>

  /**
   * Settings shared by every mutator, over those of the presets.
   */
  settings?: Partial<PresetSettings>

  /**
   * Plugin objects keyed by the namespace that prefixes their ids; the
   * configuration file imports them.
   */
  plugins?: Record<string, Plugin>

  /**
   * Ids of the presets applied first, in order; `['recommended']` when omitted.
   * `--preset` replaces them.
   */
  extends?: string[]
}
