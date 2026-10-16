import type { MutatorRegistry } from '../../types/mutator/mutator-registry'
import type { MutatorSetting } from '../../types/mutator/mutator-setting'
import type { PresetSettings } from '../../types/config/preset-settings'
import type { ActiveMutator } from '../../types/mutator/active-mutator'

import { findClosestName } from '../text/find-closest-name'
import { compareCodeUnits } from '../compare-code-units'

/**
 * Mutators and settings of a run, after `extends` is applied.
 */
export interface ResolvedPreset {
  /**
   * Settings merged through `extends`, with `coarseMutants: false`, `templates:
   * true`, `timeouts: false` and no `loggers` unless a preset sets them,
   * frozen.
   */
  settings: Readonly<PresetSettings>

  /**
   * Mutators the applied presets turn on, in rank order, with frozen options.
   */
  mutators: ActiveMutator[]
}

/**
 * Mutator settings and preset settings gathered from a preset and the presets
 * it extends.
 */
interface PresetCollection {
  /**
   * Setting of every mutator a preset mentions, keyed by mutator id; later
   * presets overwrite earlier ones.
   */
  mutators: Map<string, MutatorSetting>

  /**
   * Preset settings merged key by key, later presets winning.
   */
  settings: Partial<PresetSettings>

  /**
   * Ids of the presets being collected, outermost first, to detect cycles.
   */
  chain: string[]
}

/**
 * Applies a preset and the presets it extends: turns on the mutators they
 * enable, with preset options merged over each mutator's default options, and
 * merges their shared settings. Mutators that no applied preset mentions stay
 * off.
 *
 * @param registry - Mutators and presets of the loaded plugins.
 * @param presetId - Id of the preset to apply, such as `recommended`.
 * @returns Active mutators in rank order and the merged settings.
 * @throws Error - When the preset is unknown, extends an unknown preset,
 *   extends itself or refers to an unknown mutator.
 */
export function resolvePreset(
  registry: MutatorRegistry,
  presetId: string,
): ResolvedPreset {
  if (!registry.presets.has(presetId)) {
    throw new Error(createUnknownPresetMessage(registry, presetId))
  }

  let collection: PresetCollection = {
    mutators: new Map(),
    settings: {},
    chain: [],
  }
  collectPreset(registry, presetId, collection)

  let mutators: ActiveMutator[] = []
  for (let registered of registry.mutators.values()) {
    let setting = collection.mutators.get(registered.id)
    if (setting === undefined || setting === 'off') {
      continue
    }
    let presetOptions = setting === 'on' ? {} : setting[1]
    mutators.push({
      ...registered,
      options: Object.freeze({
        ...registered.mutator.meta.defaultOptions,
        ...presetOptions,
      }),
    })
  }

  let settings: PresetSettings = {
    coarseMutants: false,
    templates: true,
    timeouts: false,
    loggers: [],
    ...collection.settings,
  }
  return {
    settings: Object.freeze({
      ...settings,
      loggers: Object.freeze([...settings.loggers]),
    }),
    mutators,
  }
}

/**
 * Adds a preset to the collection depth first: the presets it extends in order,
 * then its own mutator settings and preset settings, which win.
 *
 * @param registry - Mutators and presets of the loaded plugins.
 * @param presetId - Id of a registered preset.
 * @param collection - Settings gathered so far, updated in place.
 * @throws Error - When the preset extends an unknown preset, extends itself or
 *   refers to an unknown mutator.
 */
function collectPreset(
  registry: MutatorRegistry,
  presetId: string,
  collection: PresetCollection,
): void {
  let preset = registry.presets.get(presetId)!
  collection.chain.push(presetId)
  if (preset.extends) {
    for (let extendedId of preset.extends) {
      if (collection.chain.includes(extendedId)) {
        throw new Error(
          `Preset "${extendedId}" extends itself through "${presetId}".`,
        )
      }
      if (!registry.presets.has(extendedId)) {
        throw new Error(
          `Preset "${presetId}" extends unknown preset "${extendedId}".`,
        )
      }
      collectPreset(registry, extendedId, collection)
    }
  }
  collection.chain.pop()

  for (let [mutatorId, setting] of Object.entries(preset.mutators)) {
    if (!registry.mutators.has(mutatorId)) {
      throw new Error(
        `Preset "${presetId}" refers to unknown mutator "${mutatorId}".`,
      )
    }
    collection.mutators.set(mutatorId, setting)
  }
  collection.settings = { ...collection.settings, ...preset.settings }
}

/**
 * Builds the error message for a preset id that is not registered.
 *
 * @param registry - Mutators and presets of the loaded plugins.
 * @param presetId - Preset id that matched no preset.
 * @returns Message with a suggestion when a preset id is close enough, and the
 *   list of available presets.
 */
function createUnknownPresetMessage(
  registry: MutatorRegistry,
  presetId: string,
): string {
  let available = Array.from(registry.presets.keys(), id => id).toSorted(
    compareCodeUnits,
  )

  let closest = findClosestName(presetId, available)
  let suggestion = closest === null ? '' : ` Did you mean "${closest}"?`
  return `Unknown preset "${presetId}".${suggestion} Available presets: ${available.join(', ')}.`
}
