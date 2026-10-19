import { findClosestName } from '../text/find-closest-name'
import { isRecord } from './is-record'

/**
 * Logger name of the `loggers` setting: an identifier, optionally preceded by
 * the `*` that matches any prefix.
 */
const LOGGER_NAME_PATTERN =
  /^\*?[\p{ID_Start}$_][\p{ID_Continue}$\u{200C}\u{200D}]*$/u

/**
 * Names of the preset settings whose values are true or false.
 */
let booleanSettingNames = ['coarseMutants', 'templates', 'timeouts']

/**
 * Names of every preset setting.
 */
let settingNames = [...booleanSettingNames, 'loggers']

/**
 * Finds what is wrong with preset settings read at runtime: they must be an
 * object whose keys are known settings, with boolean values except `loggers`,
 * an array of logger names.
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
    if (name === 'loggers') {
      let problem = getLoggersProblem(setting)
      if (problem !== null) {
        return problem
      }
    } else if (typeof setting !== 'boolean') {
      return `"${name}" is not true or false`
    }
  }
  return null
}

/**
 * Finds what is wrong with the `loggers` setting: it must be an array of
 * identifiers, each optionally preceded by `*`; a bare `*` would make every
 * call a logging call.
 *
 * @param value - Value of the setting.
 * @returns Description of the first problem, or null when there is none.
 */
function getLoggersProblem(value: unknown): string | null {
  if (!Array.isArray(value)) {
    return '"loggers" is not an array of receiver names'
  }
  let index = value.findIndex(
    (name: unknown) =>
      typeof name !== 'string' || !LOGGER_NAME_PATTERN.test(name),
  )
  return index === -1 ? null : (
      `"loggers" item ${index} is not a name, such as "logger" or "*Logger"`
    )
}
