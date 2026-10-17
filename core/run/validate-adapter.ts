import type { TestAdapter } from '../../types/adapter/test-adapter'

import { isKebabCaseName } from '../plugins/is-kebab-case-name'
import { isRecord } from '../plugins/is-record'

/**
 * Checks the shape of a test runner adapter given in the configuration: an
 * object with a kebab-case `name`, a boolean `batch`, a `start` function and,
 * when present, a string `version`.
 *
 * @param value - Adapter object of the configuration.
 * @param source - Where it came from, for messages, such as `run.runner`.
 * @returns The same value, typed as an adapter.
 * @throws Error - When the value does not have the shape of an adapter.
 */
export function validateAdapter(value: unknown, source: string): TestAdapter {
  let problem = getAdapterProblem(value)
  if (problem !== null) {
    throw new Error(
      `The test runner adapter "${source}" is invalid: ${problem}.`,
    )
  }
  return value as TestAdapter
}

/**
 * Finds what is wrong with the shape of an adapter.
 *
 * @param value - Adapter to check.
 * @returns Description of the first problem, or null when there is none.
 */
function getAdapterProblem(value: unknown): string | null {
  if (!isRecord(value)) {
    return 'it must be an object'
  }
  if (typeof value['name'] !== 'string' || !isKebabCaseName(value['name'])) {
    return '"name" must be a kebab-case name'
  }
  if (typeof value['batch'] !== 'boolean') {
    return '"batch" must be true or false'
  }
  if (typeof value['start'] !== 'function') {
    return '"start" must be a function'
  }
  if (value['version'] !== undefined && typeof value['version'] !== 'string') {
    return '"version" must be a string'
  }
  return null
}
