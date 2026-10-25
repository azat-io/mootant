import { readdir, stat } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import path from 'node:path'

import type { AdapterSession } from '../../types/adapter/adapter-session'
import type { ActiveMutator } from '../../types/mutator/active-mutator'
import type { DryRunResult } from '../../types/adapter/dry-run-result'
import type { TestAdapter } from '../../types/adapter/test-adapter'
import type { FileMutants } from '../../types/mutant/file-mutants'
import type { StoredCache } from '../../types/cache/stored-cache'
import type { DryAnalysis } from '../../types/run/dry-analysis'
import type { LimitSettings } from '../../types/run/run-state'
import type { RunCache } from '../../types/cache/run-cache'

import { getTestFileKey } from '../run/get-test-file-key'
import { getEnvironmentKey } from './get-environment-key'
import { findChangedFiles } from './find-changed-files'
import { getTestFileKeys } from './get-test-file-keys'
import { createRunCache } from './create-run-cache'
import { findLockfile } from './find-lockfile'
import { hashFiles } from './hash-files'

/**
 * What the cache of a run is prepared from.
 */
interface PrepareInput {
  /**
   * Preset, active mutators and preset settings of the run.
   */
  setup: { mutators: ActiveMutator[]; settings: unknown; preset: string }

  /**
   * Every file the paths of the run list mutants from, the files `--since` or
   * `--mutant` leave out included, so the keys do not depend on the selection,
   * with the texts and the regions of their mutants (see `getMutantRegions`).
   */
  files: readonly FileMutants[]

  /**
   * Entries and inputs of the cache file, read while the dry run went on.
   */
  stored: Promise<StoredCache>

  /**
   * Live test runner after the dry run.
   */
  session: AdapterSession

  /**
   * Coverage and tests of the dry run.
   */
  analysis: DryAnalysis

  /**
   * How try limits grow from the dry run.
   */
  limits: LimitSettings

  /**
   * Whether entries are also reused by their incremental key (`--incremental`).
   */
  incremental: boolean

  /**
   * Adapter of the session.
   */
  adapter: TestAdapter

  /**
   * The dry run, with the dependencies of every test file.
   */
  dry: DryRunResult

  /**
   * Start of the run in milliseconds since the epoch, before mutants were
   * listed.
   */
  started: number

  /**
   * Project root.
   */
  root: string

  /**
   * Current time in milliseconds since the epoch.
   */
  now: number
}

/**
 * Prepares the cache of a run after its dry run: asks the adapter what every
 * verdict depends on, hashes those files together with the `.env` files, the
 * lockfile, `package.json` and the `tsconfig` and `jsconfig` files of the root,
 * every file a test file depended on and every file stored entries read beyond
 * that, each file once, then builds the environment key and the key of every
 * test file, which takes in the environment variables it read, and the key of
 * every test file over what it reads outside the files mutants are listed from,
 * for the incremental keys. Files modified since the run started may have
 * changed after the test runner read them, so their hash may not be what
 * verdicts came from: a test file that depends on one gets no key, and no test
 * file gets one when a file of the environment changed. Dependencies the test
 * code of the dry run changed itself (`DryFile.modified`) are hashed as they
 * are now, which is what the next run starts from; `saveRunCache` checks that
 * their contents stayed so.
 *
 * @param input - Session, dry run, settings and the stored entries.
 * @returns Cache of the run, or null when the adapter cannot tell what verdicts
 *   depend on, a file of the environment changed during the run, or no test
 *   file has a key.
 */
export async function prepareRunCache(
  input: PrepareInput,
): Promise<RunCache | null> {
  let { session, setup, root, dry } = input
  if (session.cacheInputs === undefined) {
    return null
  }
  let inputs = await session.cacheInputs()
  let lockfile = findLockfile(root)
  let files = [
    ...inputs.files,
    ...(lockfile === null ? [] : [lockfile]),
    path.join(root, 'package.json'),
    ...(await readdir(root))
      .filter(name => /^(?:\.env|(?:jsconfig|tsconfig).*\.json$)/u.test(name))
      .map(name => path.join(root, name)),
  ]
  let dependencies = new Map(
    dry.files.flatMap(file =>
      Array.isArray(file.dependencies) ?
        [[getTestFileKey(file), [file.file, ...file.dependencies]] as const]
      : [],
    ),
  )
  let all = [...files, ...[...dependencies.values()].flat()]
  let modified = new Set(dry.files.flatMap(file => file.modified ?? []))
  let changed = await findChangedFiles(all, input.started)
  if (files.some(file => changed.has(file))) {
    return null
  }
  for (let file of modified) {
    changed.delete(file)
  }
  let stored = await input.stored
  let hashes = await hashFiles([
    ...all,
    ...[...stored.inputs.values()].flatMap(value =>
      value.files.map(([relative]) => path.resolve(root, relative)),
    ),
  ])
  let variables = inputs.environment ?? {}
  let environment = getEnvironmentKey({
    mutators: {
      mutators: setup.mutators.map(mutator => [mutator.id, mutator.options]),
      settings: setup.settings,
      preset: setup.preset,
    },
    runner: {
      version: input.adapter.version ?? null,
      runner: session.version ?? null,
      adapter: input.adapter.name,
    },
    build: (await stat(import.meta.filename)).mtimeMs,
    settings: inputs.settings,
    limits: input.limits,
    hashes,
    files,
    root,
  })
  let keyed = dry.files.filter(file =>
    (dependencies.get(getTestFileKey(file)) ?? []).every(
      dependency => !changed.has(dependency),
    ),
  )
  let fileKeys = getTestFileKeys({
    mutated: new Set(),
    files: keyed,
    environment,
    variables,
    hashes,
    root,
  })
  if (fileKeys.size === 0) {
    return null
  }
  return createRunCache({
    sources: new Map(
      input.files.flatMap(file =>
        file.source === null ?
          []
        : [[file.file, createHash('sha256').update(file.source).digest('hex')]],
      ),
    ),
    outsideKeys: getTestFileKeys({
      mutated: new Set(input.files.map(file => file.absolute)),
      files: keyed,
      environment,
      variables,
      hashes,
      root,
    }),
    reads: new Map(
      dry.files.map(file => [getTestFileKey(file), file.environment ?? []]),
    ),
    dependencies: new Map(
      [...dependencies].filter(([file]) => fileKeys.has(file)),
    ),
    regions: new Map(input.files.flatMap(file => [...(file.regions ?? [])])),
    incremental: input.incremental,
    analysis: input.analysis,
    environment: files,
    now: input.now,
    variables,
    fileKeys,
    stored,
    hashes,
    root,
  })
}
