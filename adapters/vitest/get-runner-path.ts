import { existsSync } from 'node:fs'
import path from 'node:path'

/**
 * Finds mootant's worker runner, which Vitest loads in every worker: the built
 * `runner.js` next to this module in the package, else the `runner.ts` source.
 *
 * @param directory - Directory of the adapter; this module's directory when
 *   omitted.
 * @returns Absolute path of the runner module.
 */
export function getRunnerPath(directory: string = import.meta.dirname): string {
  let built = path.join(directory, 'runner.js')
  return existsSync(built) ? built : path.join(directory, 'runner.ts')
}
