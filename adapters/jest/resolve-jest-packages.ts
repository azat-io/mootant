import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

import type { JestPackages } from './types/jest-packages'

/**
 * First version of `@jest/transform` that strips the types of a TypeScript file
 * no transformer claims, with Node's own function.
 */
const STRIPPING_VERSION = [30, 5, 2]

/**
 * Finds the project's Jest packages: `jest` from the root, `jest-cli` from
 * `jest`, `@jest/core` from `jest-cli`, and the packages mootant loads from
 * `@jest/core`, so strict pnpm and a mismatched hoisted copy both work. The
 * version is that of `@jest/core`, since `jest` itself can be older. It is
 * checked before anything further, as old versions may lack a package. The
 * binary comes from the `bin` field, since the exports map of `jest` blocks its
 * path. The version of the `@jest/transform` that `jest-runner` runs tests with
 * tells whether types are stripped, and `@jest/console` comes from
 * `jest-runner` too, as workers change the class it makes the console of tests
 * from.
 *
 * @param root - Project root.
 * @returns Directories of the packages, the versions, the binary and whether
 *   Jest strips types.
 * @throws {Error} When Jest is not installed, is older than 29.7 or cannot be
 *   looked for.
 */
export async function resolveJestPackages(root: string): Promise<JestPackages> {
  /**
   * Finds the directory of a package from a directory.
   *
   * @param name - Name of the package.
   * @param directory - Directory it is found from.
   * @returns Absolute real directory of the package.
   * @throws {Error} When it is not installed there, or when Node cannot look,
   *   as with a broken `package.json`, with Node's own message.
   */
  function locate(name: string, directory: string): string {
    try {
      return path.dirname(
        createRequire(path.join(directory, 'package.json')).resolve(
          `${name}/package.json`,
        ),
      )
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'MODULE_NOT_FOUND') {
        throw error
      }
      throw new Error(`Jest is not installed in ${root}.`)
    }
  }
  let jest = locate('jest', root)
  let core = locate('@jest/core', locate('jest-cli', jest))
  let { version } = await readManifest(core)
  let [major = 0, minor = 0] = version.split('.').map(Number)
  if (major < 29 || (major === 29 && minor < 7)) {
    throw new Error(
      `mootant runs Jest 29.7 or later, but this project has Jest ${version}.`,
    )
  }
  let runner = locate('jest-runner', core)
  let transform = await readManifest(locate('@jest/transform', runner))
  return {
    stripsTypes: isAtLeast(transform.version, STRIPPING_VERSION),
    bin: path.join(jest, (await readManifest(jest)).bin),
    hasteMap: locate('jest-haste-map', core),
    console: locate('@jest/console', runner),
    resolve: locate('jest-resolve', core),
    runtime: locate('jest-runtime', core),
    transformVersion: transform.version,
    util: locate('jest-util', core),
    version,
    runner,
  }
}

/**
 * Tells whether a version is a given one or later.
 *
 * @param version - Version such as `30.5.2`.
 * @param least - Major, minor and patch of the given one.
 * @returns Whether it is that version or a later one.
 */
function isAtLeast(version: string, least: readonly number[]): boolean {
  let parts = version.split('.').map(Number)
  for (let [index, part] of least.entries()) {
    let own = parts[index]!
    if (own !== part) {
      return own > part
    }
  }
  return true
}

/**
 * Reads what mootant needs of a `package.json`.
 *
 * @param directory - Directory of the package.
 * @returns Its version and binary.
 */
async function readManifest(
  directory: string,
): Promise<{ version: string; bin: string }> {
  let text = await readFile(path.join(directory, 'package.json'), 'utf8')
  return JSON.parse(text) as { version: string; bin: string }
}
