import { rmSync } from 'node:fs'

import { LIVE_WORK_DIRECTORIES } from './live-work-directories'

/**
 * Removes the work directories of runs of this process that are not removed
 * yet, at once and with everything in them, and forgets them, as the last
 * cleanup before the process ends: a directory that cannot be removed is left
 * as it is, so the process still ends.
 */
export function removeLiveWorkDirectories(): void {
  for (let directory of LIVE_WORK_DIRECTORIES) {
    try {
      rmSync(directory, { recursive: true, force: true })
    } catch {}
  }
  LIVE_WORK_DIRECTORIES.clear()
}
