import { randomUUID } from 'node:crypto'

import { BUILD_HASH } from './build-hash'

/**
 * Random id of the sources in this process, or null before the first call.
 */
let sources: string | null = null

/**
 * Gives the id of mootant's own code that the cache keys take in: the hash the
 * build wrote (`BUILD_HASH`), or, when mootant runs from its sources, a random
 * id made once per process, so a later process, whose sources may differ, never
 * reuses verdicts of this one.
 *
 * @param file - Path of the module, a `.ts` file in the sources; this module's
 *   path when omitted.
 * @returns Hash of the build, or the id of the sources in this process.
 */
export function getBuildId(file: string = import.meta.filename): string {
  if (!file.endsWith('.ts')) {
    return BUILD_HASH
  }
  sources ??= randomUUID()
  return sources
}
