import type { DryRunResult } from '../adapter/dry-run-result'
import type { CacheInputs } from '../adapter/cache-inputs'
import type { Diagnostic } from '../mutant/diagnostic'

/**
 * What a run saw of its test runner up to the end of its dry phase, saved next
 * to the cache file, so that a later run whose inputs are all unchanged can
 * decide its mutants from cached verdicts without starting the test runner.
 * Paths are absolute: the key includes the project root.
 */
export interface DrySnapshot {
  /**
   * What the session reported besides its runs: its version, workers and
   * warnings, and what verdicts depend on beyond each test file, as
   * `prepareRunCache` asked it once (`AdapterSession.cacheInputs`).
   */
  session: {
    diagnostics: Diagnostic[]
    version: string | null
    workers: number | null
    inputs: CacheInputs
  }

  /**
   * Outcome of the dry phase: the final dry run, the messages of the files
   * whose mutants get no verdict, by display path, and the diagnostics of the
   * phase.
   */
  phase: {
    errors: [string, string][]
    diagnostics: Diagnostic[]
    dry: DryRunResult
  }

  /**
   * Environment variables of the main process as the run started, before the
   * test runner could set any (`listVariableHashes`): each one test code read,
   * in the dry run or in a unit whose evidence the cache holds, and `*` for all
   * but those that change from shell to shell, with the hash of the value, or
   * null when unset.
   */
  variables: [string, string | null][]

  /**
   * Files the dry run and the cache keys depended on, with the hash of their
   * contents after the dry run, or null for a missing one: the files of
   * `session.inputs`, the lockfile, `package.json`, the `.env`, `tsconfig` and
   * `jsconfig` files of the root, and every test file of the dry run with its
   * dependencies, inside the root or not.
   */
  files: [string, string | null][]

  /**
   * Test files and setup files of the session (`AdapterSession.listTestFiles`).
   */
  testFiles: string[]

  /**
   * Version of the format (`CACHE_VERSION`).
   */
  version: number

  /**
   * Hash of everything under the project root (`hashProjectTree`), taken before
   * the test runner started and checked again before saving: a file added,
   * removed or changed anywhere, such as a new test file or a helper of a test
   * file the dry run did not run, makes the snapshot stale.
   */
  tree: string

  /**
   * Hash of what the dry run was asked to do (`getDrySnapshotKey`).
   */
  key: string
}
