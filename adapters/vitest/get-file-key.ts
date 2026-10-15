import { realpathSync } from 'node:fs'
import path from 'node:path'

/**
 * Turns a path into the key switched files are looked up by: the real path with
 * symbolic links resolved and, on file systems that ignore letter case, the
 * stored spelling, so a module id and a listed path of the same file match.
 *
 * @param file - Absolute path or module id without a query.
 * @param cache - Keys already computed, by path; updated in place.
 * @returns Real path of the file, or the resolved path when it does not exist.
 */
export function getFileKey(file: string, cache: Map<string, string>): string {
  let key = cache.get(file)
  if (key === undefined) {
    try {
      key = realpathSync.native(file)
    } catch {
      key = path.resolve(file)
    }
    cache.set(file, key)
  }
  return key
}
