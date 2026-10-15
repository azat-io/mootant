import type { MutatorSetting } from '../mutator/mutator-setting'
import type { PresetSettings } from './preset-settings'

/**
 * Named selection of mutators and their options.
 */
export interface Preset {
  /**
   * Settings keyed by mutator id: `name` for built-in mutators, `plugin/name`
   * for plugin mutators. Mutators that no applied preset turns on stay off.
   */
  mutators: Record<string, MutatorSetting>

  /**
   * Settings shared by every mutator, merged key by key over the settings of
   * the extended presets.
   */
  settings?: Partial<PresetSettings>

  /**
   * One sentence for help texts and reports.
   */
  description: string

  /**
   * Ids of presets applied first, in order; this preset's own settings win.
   */
  extends?: string[]
}
