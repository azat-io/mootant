import { readdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import path from 'node:path'

import type { AdapterSession } from '../../types/adapter/adapter-session'
import type { ActiveMutator } from '../../types/mutator/active-mutator'
import type { DryRunResult } from '../../types/adapter/dry-run-result'
import type { CacheInputs } from '../../types/adapter/cache-inputs'
import type { TestAdapter } from '../../types/adapter/test-adapter'
import type { FileMutants } from '../../types/mutant/file-mutants'
import type { StoredCache } from '../../types/cache/stored-cache'
import type { Diagnostic } from '../../types/mutant/diagnostic'
import type { DryAnalysis } from '../../types/run/dry-analysis'
import type { LimitSettings } from '../../types/run/run-state'
import type { RunCache } from '../../types/cache/run-cache'

import { getTestFileKey } from '../run/get-test-file-key'
import { getEnvironmentKey } from './get-environment-key'
import { listInstallStates } from './list-install-states'
import { compareCodeUnits } from '../compare-code-units'
import { getDisplayPath } from '../run/get-display-path'
import { findChangedFiles } from './find-changed-files'
import { getTestFileKeys } from './get-test-file-keys'
import { getPortablePath } from './get-portable-path'
import { createRunCache } from './create-run-cache'
import { findLockfile } from './find-lockfile'
import { createDigest } from './create-digest'
import { UNKNOWN_HASH } from './unknown-hash'
import { getBuildId } from './get-build-id'
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
   * Absolute paths of the files the dry run switched, those it dropped as
   * broken left out: the hit counts of a unit cover only their sites, so a
   * timeout by the hit limit holds only for runs that switch the same files.
   */
  switched: readonly string[]

  /**
   * Live test runner after the dry run.
   */
  session: AdapterSession

  /**
   * Whether isolated units of one test file run at the same time; such runs
   * never reuse the verdicts of other runs, nor other runs theirs, since tests
   * that rely on a test file never running twice at once may give other
   * verdicts. False when omitted.
   */
  parallelUnits?: boolean

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
   * Whether the run is in fast mode, which neither stores nor reuses timeouts
   * by the hit limit (`RunCacheInput.timeouts`).
   */
  fast: boolean

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
 * Cache of a run, or what left the run without one.
 */
interface PreparedCache {
  /**
   * A `cache-skipped` warning that names a file which changed during the run or
   * has unknown content, or null.
   */
  warning: Diagnostic | null

  /**
   * What the session said every verdict depends on (`cacheInputs`), asked once,
   * or null when the adapter cannot tell.
   */
  inputs: CacheInputs | null

  /**
   * Cache of the run, or null.
   */
  cache: RunCache | null
}

/**
 * Prepares the cache of a run after its dry run: asks the adapter what every
 * verdict depends on, hashes those files together with the `.env` files, the
 * lockfile with the files that tell what was installed (`listInstallStates`),
 * `package.json` and the `tsconfig` and `jsconfig` files of the root, every
 * file a test file depended on and every file stored entries read beyond that,
 * each file once, then builds the environment key and the key of every test
 * file, which takes in the environment variables it read, and the key of every
 * test file over what it reads outside the files mutants are listed from, for
 * the incremental keys. Files modified since the run started may have changed
 * after the test runner read them, so their hash may not be what verdicts came
 * from: a test file that depends on one gets no key, and no test file gets one
 * when a file of the environment changed. The same goes for a path whose
 * content is unknown, such as a device or a pipe (`UNKNOWN_HASH`), whatever its
 * time. Files the test code of the dry run changed itself (`DryFile.modified`),
 * files of the environment among them, are hashed as they are now, which is
 * what the next run starts from; `saveRunCache` checks that their contents
 * stayed so. A test runner that read such a file before the test code wrote it,
 * as Vitest loads the `.env` files of its mode when it starts, may have run
 * with an earlier text than the keys show, whether the test code or the user
 * changed it. A run with parallel units has an environment key of its own.
 * Outside fast mode, the cache keeps timeouts by the hit limit too.
 *
 * @param input - Session, dry run, settings and the stored entries.
 * @returns Cache of the run, with what the session said verdicts depend on. No
 *   cache when the adapter cannot tell what verdicts depend on or no test file
 *   has a key; when a file of the environment, or a dependency while no test
 *   file has a key, changed during the run or has unknown content, with a
 *   `cache-skipped` warning that names the first such file.
 */
export async function prepareRunCache(
  input: PrepareInput,
): Promise<PreparedCache> {
  let { session, setup, root, dry } = input
  if (session.cacheInputs === undefined) {
    return { warning: null, inputs: null, cache: null }
  }
  let inputs = await session.cacheInputs()
  let lockfile = findLockfile(root)
  let files = [
    ...inputs.files,
    ...(lockfile === null ? [] : [lockfile]),
    ...listInstallStates(root),
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
  /**
   * Tells whether a file leaves what depends on it without a key: it changed
   * during the run, or its content is unknown.
   *
   * @param file - Absolute path.
   * @returns Whether it does.
   */
  function isUnsure(file: string): boolean {
    return changed.has(file) || hashes.get(file) === UNKNOWN_HASH
  }
  /**
   * Leaves the run without a cache because of a file that changed during the
   * run or whose content is unknown.
   *
   * @param file - Absolute path of the file.
   * @returns No cache, with a `cache-skipped` warning that names the file.
   */
  function skip(file: string): PreparedCache {
    let relative = getDisplayPath(file, root)
    let display = relative === '' ? 'the root of the project' : relative
    return {
      warning: {
        message:
          hashes.get(file) === UNKNOWN_HASH ?
            `Verdicts were neither reused nor cached because ${display} is a device, a pipe or a socket, so mootant cannot tell whether it changed.`
          : `Verdicts were neither reused nor cached because ${display} has a modification time at or after the start of the run, so it may have changed while the run went on.`,
        code: 'cache-skipped',
        severity: 'warning',
        column: null,
        file: null,
        line: null,
      },
      cache: null,
      inputs,
    }
  }
  let unsure = files.find(file => isUnsure(file))
  if (unsure !== undefined) {
    return skip(unsure)
  }
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
    parallelUnits: input.parallelUnits === true,
    settings: inputs.settings,
    limits: input.limits,
    build: getBuildId(),
    hashes,
    files,
    root,
  })
  let keyed = dry.files.filter(file =>
    (dependencies.get(getTestFileKey(file)) ?? []).every(
      dependency => !isUnsure(dependency),
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
    let dependency = [...dependencies.values()]
      .flat()
      .find(file => isUnsure(file))
    return dependency === undefined ?
        { warning: null, cache: null, inputs }
      : skip(dependency)
  }
  let cache = createRunCache({
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
    switched: createDigest(
      input.switched
        .map(file => getPortablePath(file, root))
        .toSorted(compareCodeUnits),
    ),
    reads: new Map(
      dry.files.map(file => [getTestFileKey(file), file.environment ?? []]),
    ),
    dependencies: new Map(
      [...dependencies].filter(([file]) => fileKeys.has(file)),
    ),
    regions: new Map(input.files.flatMap(file => [...(file.regions ?? [])])),
    incremental: input.incremental,
    analysis: input.analysis,
    timeouts: !input.fast,
    environment: files,
    now: input.now,
    variables,
    fileKeys,
    stored,
    hashes,
    root,
  })
  return { warning: null, inputs, cache }
}
