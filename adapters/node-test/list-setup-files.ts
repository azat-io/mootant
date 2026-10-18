import { fileURLToPath } from 'node:url'
import path from 'node:path'

import { listLoaders } from './list-loaders'

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
  let specifiers = listLoaders(execArgv)
  for (let [index, flag] of execArgv.entries()) {
    if (flag === '--test-global-setup') {
      specifiers.push(execArgv[index + 1] ?? '')
    } else if (flag.startsWith('--test-global-setup=')) {
      specifiers.push(flag.slice(20))
    }
  }
  return specifiers.flatMap(specifier => {
    if (specifier.startsWith('file:')) {
      return [fileURLToPath(specifier)]
    }
    return /^\.{0,2}[/\\]/u.test(specifier) || path.isAbsolute(specifier) ?
        [path.resolve(root, specifier)]
      : []
  })
}
