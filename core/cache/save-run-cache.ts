import type { CachedInputs } from '../../types/cache/cached-inputs'
import type { Diagnostic } from '../../types/mutant/diagnostic'
import type { RunCache } from '../../types/cache/run-cache'

import { getDisplayPath } from '../run/get-display-path'
import { findChangedFiles } from './find-changed-files'
import { getPortablePath } from './get-portable-path'
import { writeRunCache } from './write-run-cache'
import { createDigest } from './create-digest'
import { hashFiles } from './hash-files'

/**
 * Saves the evidence of a run into the cache file, unless the run had error
 * diagnostics or a file of the environment changed while it went on; evidence
 * from a test file whose dependencies changed while the run went on is left
 * out, since it may come from the old texts, and so is evidence whose run read
 * a file beyond them that changed. A file modified during the run that was
 * hashed for the keys counts as changed only when its content differs now, so
 * tests that write back what they read, or add and remove files of a directory
 * they list, keep their evidence; a file beyond the dependencies modified
 * during the run has no earlier hash and counts as changed. The files evidence
 * read beyond the dependencies of its test file are hashed now, and evidence
 * that shares such inputs names one stored copy of them.
 *
 * @param input - Cache of the run, where to save it and what happened.
 * @param input.cache - Lookups, entries and watched files of the run.
 * @param input.file - Absolute path of the cache file.
 * @param input.failed - Whether the run had error diagnostics.
 * @param input.started - Start of the run in milliseconds since the epoch.
 * @param input.root - Project root, for the paths of messages.
 * @param input.now - Current time in milliseconds since the epoch.
 * @returns A `cache-skipped` or `cache-write-failed` warning when nothing was
 *   saved, or null.
 */
export async function saveRunCache(input: {
  failed: boolean
  started: number
  cache: RunCache
  file: string
  root: string
  now: number
}): Promise<Diagnostic | null> {
  let { started, cache, file, root } = input
  /**
   * Builds a warning of the run.
   *
   * @param code - Kind of the warning.
   * @param message - Sentences of the warning.
   * @returns The warning.
   */
  function warn(
    code: 'cache-write-failed' | 'cache-skipped',
    message: string,
  ): Diagnostic {
    return {
      severity: 'warning',
      column: null,
      file: null,
      line: null,
      message,
      code,
    }
  }
  if (input.failed) {
    return warn(
      'cache-skipped',
      'Verdicts were not cached because the run had errors; the next run will run these mutants again.',
    )
  }
  let extra = [...cache.pending.values()].flatMap(value => value.files)
  let changed = await findChangedFiles(
    [
      ...cache.environment,
      ...[...cache.dependencies.values()].flat(),
      ...extra,
    ],
    started,
  )
  let known = await hashFiles(
    [...changed].filter(entry => cache.hashes.has(entry)),
  )
  for (let [entry, hash] of known) {
    if (cache.hashes.get(entry) === hash) {
      changed.delete(entry)
    }
  }
  let environment = cache.environment.find(entry => changed.has(entry))
  if (environment !== undefined) {
    return warn(
      'cache-skipped',
      `Verdicts were not cached because ${getDisplayPath(environment, root)} changed during the run.`,
    )
  }
  for (let [testFile, dependencies] of cache.dependencies) {
    if (dependencies.some(dependency => changed.has(dependency))) {
      cache.forget(testFile)
    }
  }
  let hashes = await hashFiles(extra)
  let inputs = new Map(cache.inputs)
  for (let [slot, value] of cache.pending) {
    if (value.files.some(dependency => changed.has(dependency))) {
      cache.entries.delete(slot)
      continue
    }
    let stored: CachedInputs = {
      files: value.files.map(dependency => [
        getPortablePath(dependency, root),
        hashes.get(dependency)!,
      ]),
      environment: value.environment,
    }
    let id = createDigest(stored).slice(0, 32)
    inputs.set(id, stored)
    cache.entries.set(slot, { ...cache.entries.get(slot)!, inputs: id })
  }
  try {
    await writeRunCache(file, { entries: cache.entries, inputs }, input.now)
  } catch (error) {
    return warn(
      'cache-write-failed',
      `The cache could not be saved to ${getDisplayPath(file, root)} (${(error as Error).message}); the next run will not reuse the verdicts of this one.`,
    )
  }
  return null
}
