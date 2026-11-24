import { readFile } from 'node:fs/promises'

import type { DrySnapshot } from '../../types/cache/dry-snapshot'

import { isRecord } from '../plugins/is-record'
import { CACHE_VERSION } from './cache-version'

/**
 * Reads the saved dry run of a project (`DrySnapshot`). A missing or unreadable
 * file, invalid JSON, another version or a value without the parts of a saved
 * dry run gives none: it only ever makes a run faster.
 *
 * @param file - Absolute path of the file (`getDrySnapshotPath`).
 * @returns The saved dry run, or null.
 */
export async function readDrySnapshot(
  file: string,
): Promise<DrySnapshot | null> {
  let content: unknown
  try {
    content = JSON.parse(await readFile(file, 'utf8'))
  } catch {
    return null
  }
  return isSnapshot(content) ? content : null
}

/**
 * Tells whether a value read from the file has the parts of a saved dry run of
 * this version; the parts themselves are trusted, as mootant wrote them, and a
 * replay that trips on one falls back to a run with the test runner.
 *
 * @param content - Parsed content of the file.
 * @returns Whether it is a saved dry run.
 */
function isSnapshot(content: unknown): content is DrySnapshot {
  return (
    isRecord(content) &&
    content['version'] === CACHE_VERSION &&
    typeof content['key'] === 'string' &&
    typeof content['tree'] === 'string' &&
    Array.isArray(content['files']) &&
    Array.isArray(content['variables']) &&
    Array.isArray(content['testFiles']) &&
    isRecord(content['session']) &&
    isRecord(content['phase']) &&
    isRecord(content['phase']['dry'])
  )
}
