import path from 'node:path'

import { CACHE_VERSION } from './cache-version'

/**
 * Builds the path of the saved dry run of a project (`DrySnapshot`), next to
 * the cache file.
 *
 * @param root - Project root.
 * @returns Absolute path, such as
 *   `<root>/node_modules/.cache/mootant/dry-v5.json`.
 */
export function getDrySnapshotPath(root: string): string {
  return path.join(
    root,
    'node_modules',
    '.cache',
    'mootant',
    `dry-v${CACHE_VERSION}.json`,
  )
}
