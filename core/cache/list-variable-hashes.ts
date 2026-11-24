import { createHash } from 'node:crypto'

import { VOLATILE_VARIABLES } from './volatile-variables'
import { compareCodeUnits } from '../compare-code-units'
import { createDigest } from './create-digest'

/**
 * Hashes environment variables of the main process for a saved dry run
 * (`DrySnapshot.variables`): each variable that test code read, by name, set or
 * not, and under `*` every variable but those that change from one shell to
 * another (`VOLATILE_VARIABLES`), so that adding, removing or changing any of
 * them changes it. The configuration of the test runner and its own code read
 * variables in the main process, where nothing tracks which, and what they read
 * goes into the settings and the variables a replay takes from the saved run.
 *
 * @param names - Names test code read; `*` is added if missing.
 * @param environment - Environment variables of the main process.
 * @returns Name and SHA-256 in hex of each value, or null when unset, sorted by
 *   name.
 */
export function listVariableHashes(
  names: Iterable<string>,
  environment: NodeJS.ProcessEnv,
): [string, string | null][] {
  return [...new Set([...names, '*'])]
    .toSorted(compareCodeUnits)
    .map(name => [
      name,
      name === '*' ? hashAll(environment) : hashValue(environment[name]),
    ])
}

/**
 * Hashes every variable but the volatile ones, with its name.
 *
 * @param environment - Environment variables.
 * @returns SHA-256 in hex.
 */
function hashAll(environment: NodeJS.ProcessEnv): string {
  return createDigest(
    Object.entries(environment)
      .filter(
        ([name, value]) => value !== undefined && !VOLATILE_VARIABLES.has(name),
      )
      .toSorted(([left], [right]) => compareCodeUnits(left, right)),
  )
}

/**
 * Hashes the value of one variable.
 *
 * @param value - Value, or undefined when unset.
 * @returns SHA-256 in hex, or null when unset.
 */
function hashValue(value: undefined | string): string | null {
  return value === undefined ? null : (
      createHash('sha256').update(value).digest('hex')
    )
}
