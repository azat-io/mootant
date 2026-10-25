import type { Config } from '../../types/config/config'

import { getSettingsProblem } from '../plugins/get-settings-problem'
import { isMutatorSetting } from '../plugins/is-mutator-setting'
import { findClosestName } from '../text/find-closest-name'
import { isRecord } from '../plugins/is-record'

/**
 * Keys of a configuration.
 */
let configKeys = ['extends', 'mutators', 'plugins', 'run', 'settings']

/**
 * Keys of the `run` settings.
 */
let runKeys = [
  'cache',
  'concurrency',
  'fast',
  'hitLimit',
  'incremental',
  'paths',
  'runner',
  'threshold',
  'timeout',
]

/**
 * Checks the shape of a configuration read from a file: an object with only
 * known keys, `plugins` whose values are plugin objects, `extends` as a list of
 * preset ids, mutator settings that are `'on'`, `'off'` or `['on', options]`,
 * preset settings (booleans, and `loggers` as an array of logger names), and
 * `run` settings of the right types and ranges. Plugins, ids and adapters are
 * checked when they are loaded and registered. A script without a default
 * export is invalid.
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
 * Finds what is wrong with the `run` settings: unknown keys, a threshold out of
 * 0 to 100, a concurrency that is not a positive integer, a non-boolean `fast`,
 * `cache` or `incremental`, a runner that is neither a name nor an object,
 * paths that are not non-empty strings, and limit settings that are not
 * positive numbers.
 *
 * @param value - Run settings read from the configuration file.
 * @returns Description of the first problem, or null when there is none.
 */
function getRunProblem(value: unknown): string | null {
  if (!isRecord(value)) {
    return 'it must be an object'
  }
  for (let key of Object.keys(value)) {
    if (!runKeys.includes(key)) {
      let closest = findClosestName(key, runKeys)
      let suggestion = closest === null ? '' : ` (did you mean "${closest}"?)`
      return `"${key}" is not a run setting${suggestion}`
    }
  }
  let { incremental, concurrency, threshold, runner, paths, cache, fast } =
    value
  if (
    threshold !== undefined &&
    (typeof threshold !== 'number' || !(threshold >= 0) || !(threshold <= 100))
  ) {
    return '"threshold" must be a number from 0 to 100'
  }
  if (
    concurrency !== undefined &&
    (!Number.isSafeInteger(concurrency) || (concurrency as number) < 1)
  ) {
    return '"concurrency" must be a positive integer'
  }
  if (fast !== undefined && typeof fast !== 'boolean') {
    return '"fast" must be true or false'
  }
  if (cache !== undefined && typeof cache !== 'boolean') {
    return '"cache" must be true or false'
  }
  if (incremental !== undefined && typeof incremental !== 'boolean') {
    return '"incremental" must be true or false'
  }
  if (
    runner !== undefined &&
    !isRecord(runner) &&
    (typeof runner !== 'string' || runner === '')
  ) {
    return '"runner" must be a built-in adapter name or an adapter object'
  }
  if (
    paths !== undefined &&
    (!Array.isArray(paths) ||
      paths.some(item => typeof item !== 'string' || item === ''))
  ) {
    return '"paths" must be a list of non-empty paths'
  }
  return (
    getLimitProblem(value, 'timeout', ['constant', 'factor']) ??
    getLimitProblem(value, 'hitLimit', ['factor', 'floor'])
  )
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
  if (value['run'] !== undefined) {
    let problem = getRunProblem(value['run'])
    if (problem !== null) {
      return `"run" is invalid: ${problem}`
    }
  }
  return null
}

/**
 * Finds what is wrong with one limit setting of `run`: an object whose known
 * keys hold positive finite numbers.
 *
 * @param run - Value of `run`.
 * @param name - Key of the limit setting.
 * @param keys - Keys the setting may have.
 * @returns Description of the problem, or null when there is none.
 */
function getLimitProblem(
  run: Record<string, unknown>,
  name: string,
  keys: string[],
): string | null {
  let limit = run[name]
  if (limit === undefined) {
    return null
  }
  if (!isRecord(limit)) {
    return `"${name}" must be an object`
  }
  for (let [key, number] of Object.entries(limit)) {
    if (!keys.includes(key)) {
      return `"${name}.${key}" is not a limit setting`
    }
    if (typeof number !== 'number' || !Number.isFinite(number) || number <= 0) {
      return `"${name}.${key}" must be a positive number`
    }
  }
  return null
}
