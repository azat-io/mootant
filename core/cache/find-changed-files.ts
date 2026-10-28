import { stat } from 'node:fs/promises'

import { runInChunks } from './run-in-chunks'

/**
 * Most files checked at once, so a large project does not run out of file
 * descriptors.
 */
const CHUNK_SIZE = 64

/**
 * Finds the files modified at or after a moment, such as files edited while a
 * run went on. Missing files are not changed: a file created or removed during
 * a run is not seen.
 *
 * @param paths - Absolute paths, duplicates allowed.
 * @param since - Moment in milliseconds since the epoch.
 * @returns Paths whose modification time is at or after `since`.
 */
export async function findChangedFiles(
  paths: Iterable<string>,
  since: number,
): Promise<Set<string>> {
  let changed = new Set<string>()
  await runInChunks([...new Set(paths)], CHUNK_SIZE, async file => {
    try {
      if ((await stat(file)).mtimeMs >= since) {
        changed.add(file)
      }
    } catch {}
  })
  return changed
}
