import path from 'node:path'

import type { PresetSettings } from '../../types/config/preset-settings'
import type { ActiveMutator } from '../../types/mutator/active-mutator'
import type { RunConfig } from '../../types/config/run-config'

import { createMutatorRegistry } from '../plugins/create-mutator-registry'
import { findClosestName } from '../text/find-closest-name'
import { validatePlugin } from '../plugins/validate-plugin'
import { resolvePreset } from '../plugins/resolve-preset'
import { compareCodeUnits } from '../compare-code-units'
import { corePlugin } from '../plugins/core-plugin'
import { loadConfig } from './load-config'

/**
 * Mutators, settings, root and run settings of a run.
 */
interface RunSetup {
  /**
   * Settings merged through the presets and the configuration, frozen.
   */
  settings: Readonly<PresetSettings>

  /**
   * Ids of every registered mutator, for the ignore comments.
   */
  knownMutatorIds: Set<string>

  /**
   * Mutators turned on, in rank order.
   */
  mutators: ActiveMutator[]

  /**
   * Presets the run extends, joined for reports.
   */
  preset: string

  /**
   * Settings of `mootant run` from the configuration, or an empty object.
   */
  run: RunConfig

  /**
   * Directory that display paths and mutant ids are relative to: the directory
   * of the configuration file, or the working directory without one.
   */
  root: string
}

/**
 * Options of a run that decide its mutators and its root.
 */
interface RunOptions {
  /**
   * Path of the configuration file given with `--config`, or undefined to
   * search for one.
   */
  config?: string

  /**
   * Preset given with `--preset`, which replaces the `extends` of the
   * configuration.
   */
  preset?: string

  /**
   * Working directory of the run.
   */
  cwd: string
}

/**
 * Id under which the preset of the run is registered; it is not kebab-case, so
 * no plugin preset can take it.
 */
const RUN_PRESET_ID = 'mootant:run'

/**
 * Prepares the mutators of a run: loads the configuration, checks its plugins,
 * registers them next to the core plugin and resolves a preset made of the
 * presets the run extends (`--preset`, else the configuration's `extends`, else
 * `recommended`) and the configuration's mutator settings and settings, which
 * win.
 *
 * @param options - Configuration path, preset and working directory.
 * @returns Active mutators, settings, known ids, presets, root and run settings
 *   of the run.
 * @throws Error - When the configuration or a plugin cannot be loaded or is
 *   invalid, or a preset or mutator id is unknown.
 */
export async function prepareRun(options: RunOptions): Promise<RunSetup> {
  let { cwd } = options
  let loaded = await loadConfig(options.config, cwd)
  let config = loaded?.config ?? {}
  let plugins = Object.fromEntries(
    Object.entries(config.plugins ?? {}).map(([namespace, plugin]) => [
      namespace,
      validatePlugin(plugin, namespace),
    ]),
  )
  let registry = createMutatorRegistry(corePlugin, plugins)
  let extended =
    options.preset === undefined ?
      (config.extends ?? ['recommended'])
    : [options.preset]
  for (let presetId of extended) {
    resolvePreset(registry, presetId)
  }
  let known = Array.from(registry.mutators.keys(), id => id).toSorted(
    compareCodeUnits,
  )
  if (config.mutators !== undefined) {
    for (let mutatorId of Object.keys(config.mutators)) {
      if (!registry.mutators.has(mutatorId)) {
        let closest = findClosestName(mutatorId, known)
        let suggestion = closest === null ? '' : ` Did you mean "${closest}"?`
        throw new Error(
          `Unknown mutator "${mutatorId}" in ${path.relative(cwd, loaded!.file)}.${suggestion}`,
        )
      }
    }
  }
  registry.presets.set(RUN_PRESET_ID, {
    description: 'Presets of the run with the settings of the configuration.',
    mutators: config.mutators ?? {},
    settings: config.settings ?? {},
    extends: extended,
  })
  let { mutators, settings } = resolvePreset(registry, RUN_PRESET_ID)
  return {
    knownMutatorIds: new Set(known),
    root: loaded?.directory ?? cwd,
    preset: extended.join(', '),
    run: config.run ?? {},
    mutators,
    settings,
  }
}
