import { VOLATILE_VARIABLES } from '../../core/cache/volatile-variables'
import { compareCodeUnits } from '../../core/compare-code-units'
import { createDigest } from '../../core/cache/create-digest'

/**
 * Indexes the hashes of the environment variables of a test runner for the
 * cache: the hash of each variable by name, and under `*` a hash of all of them
 * but those that change from one shell to another (`VOLATILE_VARIABLES`) and
 * those the test runner sets itself.
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
      sorted.filter(
        ([name]) => !VOLATILE_VARIABLES.has(name) && !ignored.includes(name),
      ),
    ),
  }
}
