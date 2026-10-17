import type { CacheEntry } from '../../types/cache/cache-entry'

/**
 * Milliseconds an entry is kept after a run last used it.
 */
const MAX_AGE = 30 * 24 * 60 * 60 * 1000

/**
 * Most entries a cache file keeps.
 */
const MAX_ENTRIES = 200_000

/**
 * Drops the entries no run used for 30 days, such as the evidence of deleted
 * mutants, then keeps the 200 000 most recently used.
 *
 * @param entries - Entries by slot.
 * @param now - Current time in milliseconds since the epoch.
 * @returns Entries that stay, by slot.
 */
export function pruneCacheEntries(
  entries: ReadonlyMap<string, CacheEntry>,
  now: number,
): Map<string, CacheEntry> {
  let fresh = [...entries].filter(([, entry]) => now - entry.used <= MAX_AGE)
  if (fresh.length > MAX_ENTRIES) {
    fresh = fresh
      .toSorted(([, left], [, right]) => right.used - left.used)
      .slice(0, MAX_ENTRIES)
  }
  return new Map(fresh)
}
