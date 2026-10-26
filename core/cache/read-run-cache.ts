import { readFile } from 'node:fs/promises'

import type { CachedInputs } from '../../types/cache/cached-inputs'
import type { StoredCache } from '../../types/cache/stored-cache'
import type { CacheEntry } from '../../types/cache/cache-entry'

import { CACHE_VERSION } from './cache-version'
import { isRecord } from '../plugins/is-record'

/**
 * Statuses an entry may store.
 */
const STATUSES = new Set<unknown>(['Survived', 'Killed'])

/**
 * Paths an entry may come from.
 */
const PATHS = new Set<unknown>(['isolated', 'batch'])

/**
 * Reads the entries of a cache file and the inputs they name. A missing or
 * unreadable file, invalid JSON or another version gives no entries, and
 * malformed entries and inputs are dropped one by one, an entry with them: the
 * cache only ever makes a run faster, so it never fails one.
 *
 * @param file - Absolute path of the cache file.
 * @returns Entries by slot and inputs by id.
 */
export async function readRunCache(file: string): Promise<StoredCache> {
  let stored: StoredCache = { entries: new Map(), inputs: new Map() }
  let content: unknown
  try {
    content = JSON.parse(await readFile(file, 'utf8'))
  } catch {
    return stored
  }
  if (
    !isRecord(content) ||
    content['version'] !== CACHE_VERSION ||
    !isRecord(content['entries']) ||
    !isRecord(content['inputs'])
  ) {
    return stored
  }
  let inputs = Object.entries(content['inputs'])
  for (let [id, value] of inputs) {
    if (isInputs(value)) {
      stored.inputs.set(id, value)
    }
  }
  let entries = Object.entries(content['entries'])
  for (let [slot, entry] of entries) {
    if (
      isEntry(entry) &&
      (entry.inputs === null || stored.inputs.has(entry.inputs))
    ) {
      stored.entries.set(slot, entry)
    }
  }
  return stored
}

/**
 * Tells whether a value read from the cache file has the shape of an entry.
 *
 * @param value - Value of a slot.
 * @returns Whether it is an entry.
 */
function isEntry(value: unknown): value is CacheEntry {
  return (
    isRecord(value) &&
    typeof value['key'] === 'string' &&
    typeof value['used'] === 'number' &&
    typeof value['first'] === 'boolean' &&
    STATUSES.has(value['status']) &&
    PATHS.has(value['path']) &&
    isNullableString(value['incremental']) &&
    isNullableString(value['inputs']) &&
    isNullableString(value['test']) &&
    isNullableString(value['cause']) &&
    isNullableString(value['message'])
  )
}

/**
 * Tells whether a value is a list of names with a hash or null.
 *
 * @param value - Value to check.
 * @returns Whether every item is such a pair.
 */
function isPairList(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.every(
      pair =>
        Array.isArray(pair) &&
        pair.length === 2 &&
        typeof pair[0] === 'string' &&
        isNullableString(pair[1]),
    )
  )
}

/**
 * Tells whether a value read from the cache file has the shape of inputs.
 *
 * @param value - Value of an id.
 * @returns Whether it is inputs.
 */
function isInputs(value: unknown): value is CachedInputs {
  return (
    isRecord(value) &&
    isPairList(value['files']) &&
    isPairList(value['environment'])
  )
}

/**
 * Tells whether a value is a string or null.
 *
 * @param value - Value to check.
 * @returns Whether it is a string or null.
 */
function isNullableString(value: unknown): boolean {
  return value === null || typeof value === 'string'
}
