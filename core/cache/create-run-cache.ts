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
import { getPortablePath } from './get-portable-path'
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
   * Keys of the same test files over what they read outside the files mutants
   * are listed from (see `getTestFileKeys`), for the incremental keys.
   */
  outsideKeys: ReadonlyMap<string, string>

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
   * Digest of the region of every mutant, by id (see `getMutantRegions`).
   */
  regions: ReadonlyMap<string, string>

  /**
   * Files every verdict depends on.
   */
  environment: readonly string[]

  /**
   * Coverage and tests of the dry run.
   */
  analysis: DryAnalysis

  /**
   * Whether entries are also reused by their incremental key (`--incremental`).
   */
  incremental: boolean

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
   * Incremental key of the evidence, or null when the mutant has no region.
   */
  incremental: string | null

  /**
   * Id of the mutant of the evidence.
   */
  mutant: string

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
 * the slot: a stored entry is valid only while its key is the same. Evidence
 * also stores an incremental key over the texts of the region of the mutant
 * (see `getMutantRegions`) and what its test file reads outside the mutated
 * files, which an incremental run accepts in place of the key, keeping a
 * verdict through changes elsewhere; such a reuse leaves the key as it was, so
 * other runs never take the verdict for the current code. A run may read more
 * than the dry run of its test file, such as a module only the mutant loads or
 * an environment variable only it reads: evidence stores those inputs, and is
 * valid only while each of them is unchanged too. Evidence of a run whose
 * inputs are unknown is not stored. Kills by a crash depend on the load of the
 * machine and are never stored, and neither are timeouts and errors.
 *
 * @param input - Stored entries, test file keys, source hashes, mutant regions,
 *   the mode and the dry run.
 * @returns Lookups and records over the stored entries, with the entries the
 *   run reused or wrote.
 */
export function createRunCache(input: RunCacheInput): RunCache {
  let { variables, fileKeys, analysis, sources, stored, hashes, root, now } =
    input
  let entries = new Map<string, CacheEntry>()
  let regional = new Set<string>()
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
   * @returns Slot, keys and test file, or null when the test file has no key or
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
      getPortablePath(entry.file, root),
      entry.project,
      test === null ? 'isolated' : 'batch',
      test ?? '',
    ]).slice(0, 32)
    let region = input.regions.get(mutant.mutant.id)
    return {
      incremental:
        region === undefined ? null : (
          createDigest([
            slot,
            region,
            mutant.static,
            input.outsideKeys.get(file)!,
          ])
        ),
      key: createDigest([slot, source, mutant.static, fileKey]),
      mutant: mutant.mutant.id,
      slot,
      file,
    }
  }

  /**
   * Tells whether stored evidence holds for the code of an address: its key is
   * the same, or in an incremental run its incremental key is.
   *
   * @param entry - Stored evidence in the slot of the address.
   * @param address - Slot, keys and test file of the evidence.
   * @returns Whether the evidence may be reused.
   */
  function isCurrent(entry: CacheEntry, address: Address): boolean {
    return (
      entry.key === address.key ||
      (input.incremental &&
        address.incremental !== null &&
        entry.incremental === address.incremental)
    )
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
      entry === undefined ||
      !isCurrent(entry, address) ||
      (entry.test !== null && !analysis.tests.has(entry.test)) ||
      (entry.inputs !== null &&
        !isUnchanged(address.file, stored.inputs.get(entry.inputs)!))
    ) {
      return null
    }
    if (entry.inputs !== null) {
      inputs.set(entry.inputs, stored.inputs.get(entry.inputs)!)
    }
    if (entry.key !== address.key) {
      regional.add(address.mutant)
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
   * @param origin - Path of the evidence and whether a kill on it came from the
   *   first covering test of the mutant.
   * @param recorded - A kill or a pass, with what its run read.
   */
  function write(
    address: Address | null,
    origin: Pick<CacheEntry, 'first' | 'path'>,
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
          incremental: address.incremental,
          status: 'Survived',
          path: origin.path,
          key: address.key,
          message: null,
          inputs: null,
          first: false,
          cause: null,
          test: null,
          used: now,
        }
      : {
          incremental: address.incremental,
          message: evidence.message,
          cause: evidence.cause,
          first: origin.first,
          test: evidence.test,
          path: origin.path,
          key: address.key,
          status: 'Killed',
          inputs: null,
          used: now,
        },
    )
  }

  return {
    lookupBatch: (mutant, test) => {
      let file = getTestFileKey(analysis.tests.get(test)!)
      let address = locate(mutant, file, test)
      let found = read(address)
      if (found === null || found === 'survived') {
        return found
      }
      return { first: stored.entries.get(address!.slot)!.first, verdict: found }
    },
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
    recordBatch: (mutant, test, evidence) => {
      let file = getTestFileKey(analysis.tests.get(test)!)
      let first = mutant.coveredBy[0] === test
      write(locate(mutant, file, test), { path: 'batch', first }, evidence)
    },
    recordUnit: (mutant, file, evidence) => {
      write(
        locate(mutant, file, null),
        { path: 'isolated', first: false },
        evidence,
      )
    },
    lookupUnit: (mutant, file) => read(locate(mutant, file, null)),
    dependencies: input.dependencies,
    environment: input.environment,
    regional,
    entries,
    pending,
    hashes,
    inputs,
  }
}
