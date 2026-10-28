import { fileURLToPath } from 'node:url'
import path from 'node:path'

import { listFlagValues } from './list-flag-values'
import { LOADER_FLAGS } from './loader-flags'

/**
 * Flag that names the global setup module of node:test.
 */
const GLOBAL_SETUP_FLAGS = new Set(['--test-global-setup'])

/**
 * Lists the project files Node flags load before the test file or around the
 * run: the modules of `--import`, `--require` and loaders and the file of
 * `--test-global-setup`, when given as a path or a `file:` URL rather than a
 * package name.
 *
 * @param root - Project root, which relative paths start from.
 * @param execArgv - Node flags of the test processes.
 * @returns Absolute paths in order.
 */
export function listSetupFiles(
  root: string,
  execArgv: readonly string[],
): string[] {
  let specifiers = [
    ...listFlagValues(execArgv, LOADER_FLAGS),
    ...listFlagValues(execArgv, GLOBAL_SETUP_FLAGS),
  ]
  return specifiers.flatMap(specifier => {
    if (specifier.startsWith('file:')) {
      return [fileURLToPath(specifier)]
    }
    return /^\.{0,2}[/\\]/u.test(specifier) || path.isAbsolute(specifier) ?
        [path.resolve(root, specifier)]
      : []
  })
}
