import { createRequire } from 'node:module'
import { realpathSync } from 'node:fs'
import path from 'node:path'

/**
 * Checks that mootant's worker runner and the project load the same copy of
 * Vitest. The runner imports `vitest` from mootant's own location, so with two
 * copies its base class and the workers' state would come from different
 * instances.
 *
 * @param root - Project root.
 * @param runnerPath - Absolute path of mootant's worker runner.
 * @returns Sentence about the different copies, or null when both resolve to
 *   the same directory.
 */
export function checkVitestCopy(
  root: string,
  runnerPath: string,
): string | null {
  let project = locateVitest(path.join(root, 'package.json'))
  let own = locateVitest(runnerPath)
  if (own === project) {
    return null
  }
  return `mootant and the project load different copies of Vitest (${own ?? 'none'}, ${project ?? 'none'}); install mootant as a devDependency of the project.`
}

/**
 * Finds the directory of the Vitest package resolved from a module.
 *
 * @param from - Absolute path of the module that imports Vitest.
 * @returns Real path of the package directory, or null when Vitest cannot be
 *   resolved from there.
 */
function locateVitest(from: string): string | null {
  try {
    return path.dirname(
      realpathSync(createRequire(from).resolve('vitest/package.json')),
    )
  } catch {
    return null
  }
}
