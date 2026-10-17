import path from 'node:path'

import { CACHE_VERSION } from './cache-version'

/**
 * Builds the path of the cache file of a project, next to the caches of other
 * tools in `node_modules/.cache`.
 *
 * @param root - Project root.
 * @returns Absolute path of the cache file, such as
 *   `<root>/node_modules/.cache/mootant/run-v1.json`.
 */
export function getCachePath(root: string): string {
  return path.join(
    root,
    'node_modules',
    '.cache',
    'mootant',
    `run-v${CACHE_VERSION}.json`,
  )
}
