import { compareCodeUnits } from '../../core/compare-code-units'
import { createDigest } from '../../core/cache/create-digest'

/**
 * Environment variables that change from one shell or terminal to another
 * without changing what tests do; left out of the hash of all variables, which
 * stands for code that lists them.
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
 * Indexes the hashes of the environment variables of a test runner for the
 * cache: the hash of each variable by name, and under `*` a hash of all of them
 * but those that change from one shell to another and those the test runner
 * sets itself.
 *
 * @param hashes - Hash of the value of each variable, with its name, in any
 *   order.
 * @param ignored - Further variables left out of `*`, such as those a test
 *   runner numbers its workers with.
 * @returns Hashes by name, sorted by name (`compareCodeUnits`), then `*`.
 */
export function indexEnvironmentHashes(
  hashes: readonly (readonly [string, string])[],
  ignored: readonly string[],
): Record<string, string> {
  let sorted = hashes.toSorted(([left], [right]) =>
    compareCodeUnits(left, right),
  )
  return {
    ...Object.fromEntries(sorted),
    '*': createDigest(
      sorted.filter(([name]) => !VOLATILE.has(name) && !ignored.includes(name)),
    ),
  }
}
