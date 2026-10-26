import { describe, expect, it } from 'vitest'

import type { CacheEntry } from '../../../types/cache/cache-entry'

import { pruneCacheEntries } from '../../../core/cache/prune-cache-entries'

/**
 * Days in milliseconds.
 */
const DAY = 24 * 60 * 60 * 1000

/**
 * Builds an entry last used at a time.
 *
 * @param used - Milliseconds since the epoch.
 * @returns Survived evidence last used then.
 */
function createEntry(used: number): CacheEntry {
  return {
    status: 'Survived',
    incremental: null,
    path: 'isolated',
    message: null,
    inputs: null,
    first: false,
    cause: null,
    test: null,
    key: 'k',
    used,
  }
}

describe('pruneCacheEntries', () => {
  it('drops entries no run used for 30 days', () => {
    let now = 100 * DAY
    let pruned = pruneCacheEntries(
      new Map([
        ['edge', createEntry(now - 30 * DAY)],
        ['old', createEntry(now - 31 * DAY)],
        ['new', createEntry(now)],
      ]),
      now,
    )

    expect([...pruned.keys()]).toStrictEqual(['edge', 'new'])
  })

  it('keeps the 200 000 most recently used entries', () => {
    let entries = new Map(
      Array.from({ length: 200_002 }, (_value, index) => [
        String(index),
        createEntry(index),
      ]),
    )
    let pruned = pruneCacheEntries(entries, 200_002)

    expect(pruned.size).toBe(200_000)
    expect(pruned.has('0')).toBe(false)
    expect(pruned.has('1')).toBe(false)
    expect(pruned.has('2')).toBe(true)
  })
})
