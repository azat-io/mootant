import type { Config } from '../../types/config'

import { getSettingsProblem } from '../plugins/get-settings-problem'
import { isMutatorSetting } from '../plugins/is-mutator-setting'
import { findClosestName } from '../text/find-closest-name'
import { isRecord } from '../plugins/is-record'

/**
 * Keys of a configuration.
 */
let configKeys = ['extends', 'mutators', 'plugins', 'settings']

/**
 * Checks the shape of a configuration read from a file: an object with only
 * known keys, `plugins` whose values are plugin objects, `extends` as a list of
 * preset ids, mutator settings that are `'on'`, `'off'` or `['on', options]`,
 * and boolean preset settings. Plugins and ids are checked when they are loaded
 * and registered. A script without a default export is invalid.
 *
 * @param value - Exported value of the configuration file, undefined for a
 *   script without a default export.
 * @param file - Path of the file, for messages.
 * @returns The configuration.
 * @throws Error - When the value does not have the shape of a configuration.
 */
export function validateConfig(value: unknown, file: string): Config {
  let problem = getConfigProblem(value)
  if (problem !== null) {
    throw new Error(`Invalid configuration in ${file}: ${problem}.`)
  }
  return value as Config
}

/**
 * Finds what is wrong with the shape of a configuration.
 *
 * @param value - Configuration to check.
 * @returns Description of the first problem, or null when there is none.
 */
function getConfigProblem(value: unknown): string | null {
  if (value === undefined) {
    return 'it must have a default export'
  }
  if (!isRecord(value)) {
    return 'it must export an object'
  }
  for (let key of Object.keys(value)) {
    if (!configKeys.includes(key)) {
      let closest = findClosestName(key, configKeys)
      let suggestion = closest === null ? '' : ` (did you mean "${closest}"?)`
      return `"${key}" is not a configuration key${suggestion}`
    }
  }
  let { mutators, settings, plugins } = value
  let extended = value['extends']
  if (plugins !== undefined) {
    if (!isRecord(plugins)) {
      return '"plugins" must be an object'
    }
    for (let [namespace, plugin] of Object.entries(plugins)) {
      if (!isRecord(plugin)) {
        return `plugin "${namespace}" must be a plugin object`
      }
    }
  }
  if (
    extended !== undefined &&
    (!Array.isArray(extended) || extended.some(id => typeof id !== 'string'))
  ) {
    return '"extends" must be a list of preset ids'
  }
  if (mutators !== undefined) {
    if (!isRecord(mutators)) {
      return '"mutators" must be an object'
    }
    for (let [id, setting] of Object.entries(mutators)) {
      if (!isMutatorSetting(setting)) {
        return `the setting of "${id}" must be "on", "off" or ["on", options]`
      }
    }
  }
  if (settings !== undefined) {
    let problem = getSettingsProblem(settings)
    if (problem !== null) {
      return `"settings" are invalid: ${problem}`
    }
  }
  return null
}
