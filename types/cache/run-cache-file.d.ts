import type { CachedInputs } from './cached-inputs'
import type { CacheEntry } from './cache-entry'

/**
 * Content of the cache file, `node_modules/.cache/mootant/run-v1.json`.
 */
export interface RunCacheFile {
  /**
   * Inputs entries read beyond the dry run of their test file, by id; each is
   * stored once however many entries name it.
   */
  inputs: Record<string, CachedInputs>

  /**
   * Entries by slot: one slot per mutant, test file, path and, for batch
   * entries, test, so new evidence replaces the old one.
   */
  entries: Record<string, CacheEntry>

  /**
   * Version of the format and of the key recipe (`CACHE_VERSION`).
   */
  version: number
}
