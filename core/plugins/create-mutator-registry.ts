import type { RegisteredMutator } from '../../types/registered-mutator'
import type { MutatorRegistry } from '../../types/mutator-registry'
import type { Plugin } from '../../types/plugin'

import { compareCodeUnits } from '../compare-code-units'
import { isKebabCaseName } from './is-kebab-case-name'

/**
 * Collects the mutators and presets of the core plugin and of the namespaced
 * plugins under their full ids. Mutators are ranked in canonical order: core
 * mutators by name, then the plugins by namespace and the mutators of each
 * plugin by name, so the order of object keys in plugin files never matters.
 *
 * @param core - Plugin of the built-in mutators and presets, without a
 *   namespace.
 * @param plugins - Other plugins keyed by the namespace that prefixes their
 *   ids.
 * @returns Mutators in rank order and presets, keyed by full id.
 * @throws Error - When a namespace, mutator name or preset name is not
 *   kebab-case.
 */
export function createMutatorRegistry(
  core: Plugin,
  plugins: Record<string, Plugin>,
): MutatorRegistry {
  let registry: MutatorRegistry = { mutators: new Map(), presets: new Map() }
  registerPlugin(registry, core, null)
  for (let namespace of Object.keys(plugins).toSorted(compareCodeUnits)) {
    if (!isKebabCaseName(namespace)) {
      throw new Error(`Plugin namespace "${namespace}" is not kebab-case.`)
    }
    registerPlugin(registry, plugins[namespace]!, namespace)
  }
  return registry
}

/**
 * Adds the mutators of one plugin in name order, ranked after the mutators
 * already registered, and its presets.
 *
 * @param registry - Registry being filled.
 * @param plugin - Plugin to add.
 * @param namespace - Namespace of the plugin, or null for the core plugin.
 * @throws Error - When a mutator name or preset name is not kebab-case.
 */
function registerPlugin(
  registry: MutatorRegistry,
  plugin: Plugin,
  namespace: string | null,
): void {
  let owner = namespace === null ? 'the core plugin' : `plugin "${namespace}"`
  let prefix = namespace === null ? '' : `${namespace}/`

  for (let name of Object.keys(plugin.mutators).toSorted(compareCodeUnits)) {
    if (!isKebabCaseName(name)) {
      throw new Error(`Mutator name "${name}" in ${owner} is not kebab-case.`)
    }
    let registered: RegisteredMutator = {
      mutator: plugin.mutators[name]!,
      rank: registry.mutators.size,
      id: `${prefix}${name}`,
    }
    registry.mutators.set(registered.id, registered)
  }

  if (plugin.presets) {
    for (let [name, preset] of Object.entries(plugin.presets)) {
      if (!isKebabCaseName(name)) {
        throw new Error(`Preset name "${name}" in ${owner} is not kebab-case.`)
      }
      registry.presets.set(`${prefix}${name}`, preset)
    }
  }
}
