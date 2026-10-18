import type { IsolatedUnit } from '../../../types/adapter/isolated-plan'
import type { BatchUnit } from '../../../types/adapter/batch-plan'
import type { TryFacts } from '../../../types/adapter/try-facts'

/**
 * One line of `out/<hash>-<n>.jsonl`: the tries of one test, an unhandled error
 * after a try, or the end of a unit.
 */
export type VitestOutRecord =
  | {
      /**
       * Ids of the modules the worker evaluated, the files Node's `require`
       * loaded, the project files the test code read through `node:fs` and the
       * snapshot files of the test file (`listDependencies`), or null when the
       * worker cannot tell, as with a test environment other than Vitest's
       * own.
       */
      dependencies: string[] | null

      /**
       * Message of the first failed suite hook (`beforeAll`, `afterAll`,
       * `aroundAll`) or, after them, of the failed cleanup of the worker-scoped
       * fixtures or of the failed teardown of the test environment, or null.
       */
      hookError: string | null

      /**
       * Message of the load failure, or null.
       */
      loadError: string | null

      /**
       * Names of the environment variables the test code read, or `*` when it
       * listed them all, sorted.
       */
      environment: string[]

      /**
       * Milliseconds from the start of loading to the end of collection.
       */
      loadDuration: number

      /**
       * Whether a suite or test of the file was marked concurrent.
       */
      concurrent: boolean

      /**
       * Project files and directories the test code read through `node:fs` and
       * changed itself, by writing, creating, removing or moving them or the
       * entries of a directory, sorted.
       */
      modified: string[]

      /**
       * Whether the worker stopped the unit after a timed-out try.
       */
      abandoned: boolean

      /**
       * Milliseconds from the start of loading to the end of the file.
       */
      duration: number

      /**
       * Ids of mutants whose sites ran outside any try, sorted.
       */
      covers: string[]

      /**
       * Whether the active mutant's site returned true outside tries.
       */
      reached: boolean

      /**
       * Unhandled errors outside tries.
       */
      strays: string[]

      /**
       * Epoch milliseconds at which the worker began the unit, before it waited
       * for the unit before it.
       */
      booted: number

      /**
       * Site evaluations outside any try.
       */
      hits: number

      /**
       * Index of the unit in the run's plan.
       */
      unit: number

      /**
       * Kind of the record.
       */
      kind: 'end'
    }
  | {
      /**
       * Id of the mutant active in the try before the error, or null.
       */
      mutant: string | null

      /**
       * First line of the error.
       */
      message: string

      /**
       * Id of the test of the try before the error.
       */
      test: string

      /**
       * Kind of the record.
       */
      kind: 'late'
    }
  | {
      /**
       * 1-based line of the test in its file, or null.
       */
      line: number | null

      /**
       * Tries of the test in the order they ran.
       */
      tries: TryFacts[]

      /**
       * Full name with suites, joined by `>`.
       */
      name: string

      /**
       * Kind of the record.
       */
      kind: 'test'
    }

/**
 * Content of `beat/<pid>.json`; the main process timestamps it when it first
 * sees `sequence`.
 */
export interface VitestHeartbeat {
  /**
   * Id of the active mutant, or null.
   */
  mutant: string | null

  /**
   * Id of the running test, or null outside tests.
   */
  test: string | null

  /**
   * Full name of the running test, or null outside tests.
   */
  name: string | null

  /**
   * Number of the beat, growing within the worker.
   */
  sequence: number

  /**
   * Milliseconds allowed from now.
   */
  budget: number

  /**
   * Absolute path of the test file.
   */
  file: string

  /**
   * Index of the unit in the run's plan.
   */
  unit: number

  /**
   * Process id of the worker.
   */
  pid: number
}

/**
 * Options the main process provides to workers under the key `mootant`.
 */
export interface VitestWorkerOptions {
  /**
   * Watchdog budgets of a dry run (`DryRunRequest.timeouts`), or null in batch
   * and isolated runs, whose plans carry their own.
   */
  timeouts: { test: number; file: number } | null

  /**
   * Kind of the run.
   */
  mode: 'isolated' | 'batch' | 'dry'

  /**
   * Work directory of this run.
   */
  directory: string

  /**
   * Whether a dry run tries every test twice in a row (`DryRunRequest.repeat`);
   * false in batch and isolated runs.
   */
  repeat: boolean

  /**
   * Project root; files the test code reads count as inputs only inside it.
   */
  root: string
}

/**
 * Plan file of one test file: `plan/<hash of the path>.json`.
 */
export interface VitestPlanFile {
  /**
   * Units of the test file.
   */
  units: (IsolatedUnit | BatchUnit)[]

  /**
   * Index of each unit in the run's plan.
   */
  indexes: number[]
}

declare module 'vitest' {
  /**
   * Values the main process provides to test workers.
   */
  interface ProvidedContext {
    /**
     * Options of mootant's worker runner.
     */
    mootant: VitestWorkerOptions
  }
}
