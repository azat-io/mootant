import path from 'node:path'

import type {
  PendingInputs,
  CacheEvidence,
  RunCache,
} from '../../types/cache/run-cache'
import type { MutantVerdict, MutantState } from '../../types/run/mutant-state'
import type { CachedInputs } from '../../types/cache/cached-inputs'
import type { StoredCache } from '../../types/cache/stored-cache'
import type { CacheEntry } from '../../types/cache/cache-entry'
import type { DryAnalysis } from '../../types/run/dry-analysis'

import { getTestFileKey } from '../run/get-test-file-key'
import { compareCodeUnits } from '../compare-code-units'
import { createDigest } from './create-digest'

/**
 * What the cache of a run is built from.
 */
interface RunCacheInput {
  /**
   * Hashes of the values of the environment variables of each project, by name
   * (`CacheInputs.environment`).
   */
  variables: Readonly<Record<string, Readonly<Record<string, string>>>>

  /**
   * Files the verdicts of each test file with a key depend on.
   */
  dependencies: ReadonlyMap<string, readonly string[]>

  /**
   * Names of the environment variables each test file with a key read in the
   * dry run, by test file key.
   */
  reads: ReadonlyMap<string, readonly string[]>

  /**
   * Hashes of the files the keys and stored inputs were built from, by absolute
   * path, null for a missing one.
   */
  hashes: ReadonlyMap<string, string | null>

  /**
   * Keys of the test files whose dependencies are known, by test file key
   * (`getTestFileKey`); they include the environment key.
   */
  fileKeys: ReadonlyMap<string, string>

  /**
   * Hashes of the texts mutants were listed from, by display path.
   */
  sources: ReadonlyMap<string, string>

  /**
   * Files every verdict depends on.
   */
  environment: readonly string[]

  /**
   * Coverage and tests of the dry run.
   */
  analysis: DryAnalysis

  /**
   * Entries and inputs read from the cache file.
   */
  stored: StoredCache

  /**
   * Project root; slots name test files relative to it.
   */
  root: string

  /**
   * Current time in milliseconds since the epoch.
   */
  now: number
}

/**
 * Where one piece of evidence belongs.
 */
interface Address {
  /**
   * Slot of the evidence in the cache file.
   */
  slot: string

  /**
   * Key of the test file of the evidence (`getTestFileKey`).
   */
  file: string

  /**
   * Key that valid evidence in the slot has.
   */
  key: string
}

/**
 * Creates the cache of a run over the entries of the cache file. Evidence of a
 * mutant in a test file (isolated) or a test (batch) has a slot named by the
 * mutant, the test file, the path and the test, and a key over the mutant, the
 * text of its source file, whether it is static, the key of the test file and
 * the slot: a stored entry is valid only while its key is the same. A run may
 * read more than the dry run of its test file, such as a module only the mutant
 * loads or an environment variable only it reads: evidence stores those inputs,
 * and is valid only while each of them is unchanged too. Evidence of a run
 * whose inputs are unknown is not stored. Kills by a crash depend on the load
 * of the machine and are never stored, and neither are timeouts and errors.
 *
 * @param input - Stored entries, test file keys, source hashes and the dry run.
 * @returns Lookups and records over the stored entries, with the entries the
 *   run reused or wrote.
 */
export function createRunCache(input: RunCacheInput): RunCache {
  let { variables, fileKeys, analysis, sources, stored, hashes, root, now } =
    input
  let entries = new Map<string, CacheEntry>()
  let pending = new Map<string, PendingInputs>()
  let inputs = new Map<string, CachedInputs>()
  let owners = new Map<string, string>()

  /**
   * Hashes the value of an environment variable of the project of a test file.
   *
   * @param file - Key of the test file (`getTestFileKey`).
   * @param name - Name of the variable, or `*`.
   * @returns Hash of its value, or null when it is not set.
   */
  function getVariable(file: string, name: string): string | null {
    let { project } = analysis.testFiles.get(file)!
    return (
        Object.hasOwn(variables, project) &&
          Object.hasOwn(variables[project]!, name)
      ) ?
        variables[project]![name]!
      : null
  }

  /**
   * Tells whether stored inputs are unchanged.
   *
   * @param file - Key of the test file of the entry.
   * @param value - Inputs the entry names.
   * @returns Whether every file and variable still has its hash.
   */
  function isUnchanged(file: string, value: CachedInputs): boolean {
    return (
      value.files.every(
        ([relative, hash]) =>
          (hashes.get(path.resolve(root, relative)) ?? null) === hash,
      ) &&
      value.environment.every(
        ([name, hash]) => getVariable(file, name) === hash,
      )
    )
  }

  /**
   * Finds the slot and key of evidence of a mutant.
   *
   * @param mutant - State of the mutant.
   * @param file - Key of the test file (`getTestFileKey`).
   * @param test - Id of the test for batch evidence, or null for isolated.
   * @returns Slot, key and test file, or null when the test file has no key or
   *   the source file no text.
   */
  function locate(
    mutant: MutantState,
    file: string,
    test: string | null,
  ): Address | null {
    let fileKey = fileKeys.get(file)
    let source = sources.get(mutant.mutant.file)
    if (fileKey === undefined || source === undefined) {
      return null
    }
    let entry = analysis.testFiles.get(file)!
    let slot = createDigest([
      mutant.mutant.id,
      path.relative(root, entry.file).replaceAll('\\', '/'),
      entry.project,
      test === null ? 'isolated' : 'batch',
      test ?? '',
    ]).slice(0, 32)
    return {
      key: createDigest([slot, source, mutant.static, fileKey]),
      slot,
      file,
    }
  }

  /**
   * Reads valid stored evidence and marks it as used.
   *
   * @param address - Slot, key and test file of the evidence, or null.
   * @returns The evidence, or null when there is no valid entry or its test is
   *   not in the dry run.
   */
  function read(address: Address | null): MutantVerdict | 'survived' | null {
    if (address === null) {
      return null
    }
    let entry = stored.entries.get(address.slot)
    if (
      entry?.key !== address.key ||
      (entry.test !== null && !analysis.tests.has(entry.test)) ||
      (entry.inputs !== null &&
        !isUnchanged(address.file, stored.inputs.get(entry.inputs)!))
    ) {
      return null
    }
    if (entry.inputs !== null) {
      inputs.set(entry.inputs, stored.inputs.get(entry.inputs)!)
    }
    entries.set(address.slot, { ...entry, used: now })
    owners.set(address.slot, address.file)
    if (entry.status === 'Survived') {
      return 'survived'
    }
    return {
      file: analysis.testFiles.get(address.file)!.file,
      message: entry.message,
      cause: entry.cause,
      test: entry.test,
      status: 'Killed',
    }
  }

  /**
   * Stores evidence of this run.
   *
   * @param address - Slot, key and test file of the evidence, or null.
   * @param route - Path of the evidence.
   * @param recorded - A kill or a reached pass, with what its run read.
   */
  function write(
    address: Address | null,
    route: CacheEntry['path'],
    recorded: CacheEvidence,
  ): void {
    let { verdict: evidence, inputs: seen } = recorded
    if (
      address === null ||
      !seen ||
      (evidence !== 'survived' &&
        (evidence.status !== 'Killed' || evidence.cause === 'crash'))
    ) {
      return
    }
    let known = new Set(input.dependencies.get(address.file))
    let names = new Set(input.reads.get(address.file))
    let extra: PendingInputs = {
      environment: [...new Set(seen.environment)]
        .filter(name => !names.has(name))
        .toSorted(compareCodeUnits)
        .map(name => [name, getVariable(address.file, name)]),
      files: [...new Set(seen.dependencies)]
        .filter(file => !known.has(file))
        .toSorted(compareCodeUnits),
    }
    if (extra.files.length > 0 || extra.environment.length > 0) {
      pending.set(address.slot, extra)
    } else {
      pending.delete(address.slot)
    }
    owners.set(address.slot, address.file)
    entries.set(
      address.slot,
      evidence === 'survived' ?
        {
          status: 'Survived',
          key: address.key,
          message: null,
          inputs: null,
          cause: null,
          path: route,
          test: null,
          used: now,
        }
      : {
          message: evidence.message,
          cause: evidence.cause,
          test: evidence.test,
          key: address.key,
          status: 'Killed',
          inputs: null,
          path: route,
          used: now,
        },
    )
  }

  return {
    forget: file => {
      let slots = [...owners]
        .filter(([, owner]) => owner === file)
        .map(([slot]) => slot)
      for (let slot of slots) {
        entries.delete(slot)
        pending.delete(slot)
        owners.delete(slot)
      }
    },
    lookupBatch: (mutant, test) => {
      let file = getTestFileKey(analysis.tests.get(test)!)
      let found = read(locate(mutant, file, test))
      return found === 'survived' ? null : found
    },
    recordBatch: (mutant, test, evidence) => {
      let file = getTestFileKey(analysis.tests.get(test)!)
      write(locate(mutant, file, test), 'batch', evidence)
    },
    recordUnit: (mutant, file, evidence) => {
      write(locate(mutant, file, null), 'isolated', evidence)
    },
    lookupUnit: (mutant, file) => read(locate(mutant, file, null)),
    dependencies: input.dependencies,
    environment: input.environment,
    entries,
    pending,
    hashes,
    inputs,
  }
}
