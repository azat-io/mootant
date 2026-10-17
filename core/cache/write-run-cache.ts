import { writeFile, rename, mkdir, rm } from 'node:fs/promises'
import path from 'node:path'

import type { RunCacheFile } from '../../types/cache/run-cache-file'
import type { CachedInputs } from '../../types/cache/cached-inputs'
import type { CacheEntry } from '../../types/cache/cache-entry'

import { pruneCacheEntries } from './prune-cache-entries'
import { CACHE_VERSION } from './cache-version'
import { readRunCache } from './read-run-cache'

/**
 * Saves the entries of a run into the cache file: reads the file again, since
 * another run may have written it meanwhile, puts the run's entries over it,
 * drops old entries and the inputs no entry names any more, and writes a
 * temporary file that replaces the cache file in one rename, so a reader never
 * sees half a file. Two runs at once may lose some of each other's entries,
 * never corrupt the file.
 *
 * @param file - Absolute path of the cache file.
 * @param run - What the run wrote or reused.
 * @param run.entries - Entries by slot.
 * @param run.inputs - Inputs those entries name, by id.
 * @param now - Current time in milliseconds since the epoch.
 * @throws Error - When the file cannot be written; the temporary file is
 *   removed first.
 */
export async function writeRunCache(
  file: string,
  run: {
    inputs: ReadonlyMap<string, CachedInputs>
    entries: ReadonlyMap<string, CacheEntry>
  },
  now: number,
): Promise<void> {
  let merged = await readRunCache(file)
  for (let [slot, entry] of run.entries) {
    merged.entries.set(slot, entry)
  }
  for (let [id, value] of run.inputs) {
    merged.inputs.set(id, value)
  }
  let kept = pruneCacheEntries(merged.entries, now)
  let named = new Set([...kept.values()].map(entry => entry.inputs))
  let content: RunCacheFile = {
    inputs: Object.fromEntries(
      [...merged.inputs].filter(([id]) => named.has(id)),
    ),
    entries: Object.fromEntries(kept),
    version: CACHE_VERSION,
  }
  let temporary = `${file}.${process.pid}.tmp`
  try {
    await mkdir(path.dirname(file), { recursive: true })
    await writeFile(temporary, JSON.stringify(content))
    await rename(temporary, file)
  } catch (error) {
    await rm(temporary, { force: true })
    throw error
  }
}
