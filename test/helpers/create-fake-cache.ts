import type { RunCache } from '../../types/cache/run-cache'

/**
 * Builds a run cache that finds nothing and records nothing, with the members a
 * test sets.
 *
 * @param members - Members that differ from the defaults.
 * @returns Cache with every member set.
 */
export function createFakeCache(members: Partial<RunCache> = {}): RunCache {
  return {
    lookupBatch: () => null,
    dependencies: new Map(),
    lookupUnit: () => null,
    recordBatch: () => {},
    recordUnit: () => {},
    regional: new Set(),
    entries: new Map(),
    pending: new Map(),
    hashes: new Map(),
    inputs: new Map(),
    forget: () => {},
    environment: [],
    ...members,
  }
}
