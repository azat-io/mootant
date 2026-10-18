import { existsSync } from 'node:fs'
import path from 'node:path'

/**
 * Finds mootant's preload, which every test process imports first: the built
 * `preload/preload.js` next to this module in the package, else the
 * `preload/preload.ts` source.
 *
 * @param directory - Directory of the adapter; this module's directory when
 *   omitted.
 * @returns Absolute path of the preload module.
 */
export function getPreloadPath(
  directory: string = import.meta.dirname,
): string {
  let built = path.join(directory, 'preload', 'preload.js')
  return existsSync(built) ? built : (
      path.join(directory, 'preload', 'preload.ts')
    )
}
