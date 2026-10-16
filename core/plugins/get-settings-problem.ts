import { findClosestName } from '../text/find-closest-name'
import { isRecord } from './is-record'

/**
 * Names of the preset settings.
 */
let settingNames = ['coarseMutants', 'templates', 'timeouts']

/**
 * Finds what is wrong with preset settings read at runtime: they must be an
 * object whose keys are known settings with boolean values.
 *
 * @param value - Settings read from a configuration file or a plugin.
 * @returns Description of the first problem, or null when there is none.
 */
export function getSettingsProblem(value: unknown): string | null {
  if (!isRecord(value)) {
    return 'they are not an object'
  }
  for (let [name, setting] of Object.entries(value)) {
    if (!settingNames.includes(name)) {
      let closest = findClosestName(name, settingNames)
      let suggestion = closest === null ? '' : ` (did you mean "${closest}"?)`
      return `"${name}" is not a setting${suggestion}`
    }
    if (typeof setting !== 'boolean') {
      return `"${name}" is not true or false`
    }
  }
  return null
}
