import { createHash } from 'node:crypto'

import { compareCodeUnits } from '../../core/compare-code-units'
import { createDigest } from '../../core/cache/create-digest'

/**
 * Environment variables that change from one shell or terminal to another
 * without changing what tests do; left out of the hash of all variables.
 */
const VOLATILE = new Set([
  'ITERM_SESSION_ID',
  'TERM_SESSION_ID',
  'WINDOWID',
  'OLDPWD',
  'SHLVL',
  'PWD',
  '_',
])

/**
 * Hashes the environment variables of the test processes for the cache: the
 * SHA-256 of each value by name, and under `*` a hash of all of them but those
 * that change from one shell to another.
 *
 * @param environment - Environment variables of the test processes.
 * @returns Hashes by name, sorted by name, with `*`.
 */
export function hashEnvironment(
  environment: NodeJS.ProcessEnv,
): Record<string, string> {
  let hashes = Object.entries(environment)
    .flatMap(([name, value]) =>
      value === undefined ?
        []
      : [[name, createHash('sha256').update(value).digest('hex')] as const],
    )
    .toSorted(([left], [right]) => compareCodeUnits(left, right))
  return {
    ...Object.fromEntries(hashes),
    '*': createDigest(hashes.filter(([name]) => !VOLATILE.has(name))),
  }
}
