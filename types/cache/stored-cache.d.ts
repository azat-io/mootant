import type { CachedInputs } from './cached-inputs'
import type { CacheEntry } from './cache-entry'

/**
 * Content of the cache file as a run reads it.
 */
export interface StoredCache {
  /**
   * Inputs entries read beyond the dry run of their test file, by id.
   */
  inputs: Map<string, CachedInputs>

  /**
   * Entries by slot.
   */
  entries: Map<string, CacheEntry>
}
