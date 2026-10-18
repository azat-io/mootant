import type { MutantVerdict, MutantState } from '../run/mutant-state'
import type { RunInputs } from '../adapter/run-inputs'
import type { CachedInputs } from './cached-inputs'
import type { CacheEntry } from './cache-entry'

/**
 * Verdicts of earlier runs that the current run may reuse, and the evidence it
 * adds. An entry is valid while the mutant, its source file, the test file and
 * every file and environment variable that test file read, the inputs the run
 * of the entry read beyond them, and the environment are unchanged.
 */
export interface RunCache {
  /**
   * Finds valid evidence of a mutant in a test on the batch path, a kill or a
   * reached pass, or null; only used in fast mode.
   */
  lookupBatch(
    mutant: MutantState,
    test: string,
  ): MutantVerdict | 'survived' | null

  /**
   * Finds valid evidence of a mutant in a test file (`getTestFileKey`) on the
   * isolated path, or null.
   */
  lookupUnit(
    mutant: MutantState,
    file: string,
  ): MutantVerdict | 'survived' | null

  /**
   * Records the evidence of a batch try of a mutant in a test, in fast mode: an
   * accepted kill or a reached pass, with what its unit read.
   */
  recordBatch(mutant: MutantState, test: string, evidence: CacheEvidence): void

  /**
   * Records the evidence of an isolated unit: a kill or a reached pass, with
   * what the unit read. Kills by a crash, timeouts and errors are not stored,
   * and neither is anything about a test file without a key or a unit whose
   * inputs are unknown.
   */
  recordUnit(mutant: MutantState, file: string, evidence: CacheEvidence): void

  /**
   * Files the verdicts of each test file (`getTestFileKey`) depend on, the test
   * file itself included, to find what changed while the run went on.
   */
  dependencies: ReadonlyMap<string, readonly string[]>

  /**
   * Hashes of the files the keys and stored inputs were built from, by absolute
   * path, null for a missing one, to tell whether a file modified during the
   * run still has the content its key took in.
   */
  hashes: ReadonlyMap<string, string | null>

  /**
   * Inputs that entries this run wrote read beyond the dry run of their test
   * file, by slot; the entries name them once the files are hashed.
   */
  pending: Map<string, PendingInputs>

  /**
   * Inputs the reused entries name, by id.
   */
  inputs: Map<string, CachedInputs>

  /**
   * Entries this run wrote or reused, by slot, to merge into the cache file.
   */
  entries: Map<string, CacheEntry>

  /**
   * Files every verdict depends on, such as the configuration of the test
   * runner and the lockfile.
   */
  environment: readonly string[]

  /**
   * Drops the entries this run wrote or reused for a test file
   * (`getTestFileKey`), so they are not saved.
   */
  forget(file: string): void
}

/**
 * Evidence of a run for the cache: a verdict with what the run read.
 */
export interface CacheEvidence<
  Verdict extends MutantVerdict | 'survived' = MutantVerdict | 'survived',
> {
  /**
   * What the run read, or null or undefined when the adapter cannot tell.
   */
  inputs: RunInputs | undefined | null

  /**
   * A kill or a reached pass.
   */
  verdict: Verdict
}

/**
 * Inputs a run of this session read beyond the dry run of its test file, whose
 * files are hashed when the cache is saved.
 */
export interface PendingInputs {
  /**
   * Names of environment variables with the hash of their values, or null for a
   * variable that is not set, sorted.
   */
  environment: [string, string | null][]

  /**
   * Absolute paths of the files, sorted.
   */
  files: string[]
}
