/**
 * One line of the out file of a test process. The preload writes each record
 * when it happens, synchronously, so a process that is killed or exits without
 * Node's `exit` event, as after an error that stops loading, keeps what it
 * wrote so far.
 */
export type NodeTestRecord =
  | {
      /**
       * Tries that ran when the error came (several when tries overlap); empty
       * outside tries.
       */
      tries: number[]

      /**
       * First line of the error, at most 200 code units.
       */
      message: string

      /**
       * Whether the error came before the test file finished evaluating,
       * outside tries, so it stopped or broke the load.
       */
      load: boolean

      /**
       * Kind of the record: an uncaught exception or unhandled rejection.
       */
      kind: 'error'

      /**
       * Site evaluations of the whole process when the error came; a process
       * that an error stops before its exit event has no end record.
       */
      hits: number
    }
  | {
      /**
       * Which module hooks switch modules: `registerHooks` in the main thread,
       * or `module.register()` in a thread of their own.
       */
      hooks: 'async' | 'sync'

      /**
       * Kind of the record.
       */
      kind: 'start'

      /**
       * Epoch milliseconds when the preload started.
       */
      time: number

      /**
       * Version of Node, such as `v22.12.0`.
       */
      node: string

      /**
       * Process id.
       */
      pid: number
    }
  | {
      /**
       * Earlier tries of the process with the same full name.
       */
      occurrence: number

      /**
       * Full name of the test with its suites, joined by `>`.
       */
      name: string

      /**
       * Kind of the record: a try started.
       */
      kind: 'open'

      /**
       * Number of the try in the process.
       */
      seq: number
    }
  | {
      /**
       * Kind of the record: node:test gave an uncaught error to a todo test,
       * which then failed with it as its cause, so it never fails the run.
       */
      kind: 'todo-error'

      /**
       * Number of the error's record among the error records of the process,
       * from 0.
       */
      error: number
    }
  | {
      /**
       * Kind of the record.
       */
      kind: 'mismatched' | 'served' | 'load'

      /**
       * Absolute path of the file: a module the process loaded, a switched file
       * whose loaded text differed from the original, or a switched file whose
       * switched text ran.
       */
      file: string
    }
  | {
      /**
       * Kind of the record: a failed try turned out a todo test after it was
       * recorded, or it made the unit stop starting tests.
       */
      kind: 'todo-try' | 'bail'

      /**
       * Number of the try in the process.
       */
      seq: number
    }
  | {
      /**
       * Kind of the record: the hooks of the try's test ended.
       */
      kind: 'close'

      /**
       * Number of the try in the process.
       */
      seq: number
    }
  | {
      /**
       * Kind of the record: the test file finished evaluating.
       */
      kind: 'loaded'
    }
  | NodeTestReport
  | NodeTestTry
  | NodeTestEnd

/**
 * Facts of a test process at its exit.
 */
export interface NodeTestEnd {
  /**
   * Ids of the mutants whose sites ran outside tries, sorted, or null when
   * coverage is not collected.
   */
  covers: string[] | null

  /**
   * Names of the environment variables the code read, or `*` when it listed
   * them all, sorted.
   */
  environment: string[]

  /**
   * Milliseconds the process spent outside tries after the first try started.
   */
  hookDuration: number

  /**
   * Milliseconds from the start of the preload to the start of the first try,
   * or to the exit without one.
   */
  loadDuration: number

  /**
   * Whether a try started while another one that is not its parent ran.
   */
  concurrent: boolean

  /**
   * Project files and directories the code read and changed itself, sorted.
   */
  modified: string[]

  /**
   * Absolute paths in Node's `require` cache at the exit.
   */
  required: string[]

  /**
   * Milliseconds from the start of the preload to the exit.
   */
  duration: number

  /**
   * Whether the active mutant's site returned true anywhere in the process.
   */
  reached: boolean

  /**
   * Project files and directories the code read through `node:fs`, a missing
   * one included, sorted.
   */
  files: string[]

  /**
   * Site evaluations of the whole process, in tries and outside them.
   */
  total: number

  /**
   * Exit code of the process.
   */
  code: number

  /**
   * Site evaluations outside tries.
   */
  hits: number

  /**
   * Kind of the record.
   */
  kind: 'end'
}

/**
 * Facts of one try once node:test finished its test, as the preload records
 * them.
 */
export interface NodeTestTry {
  /**
   * Ids of the mutants whose sites ran while the try ran, sorted, or null when
   * coverage is not collected (isolated units).
   */
  covers: string[] | null

  /**
   * First line of the failure, at most 200 code units, or null.
   */
  message: string | null

  /**
   * Whether the process exited while the try still ran, as when a test calls
   * `process.exit()`; such a try counts as not failed.
   */
  unfinished: boolean

  /**
   * Earlier tries of the process with the same full name, which tells tests
   * with duplicate names apart.
   */
  occurrence: number

  /**
   * Whether node:test failed the test for running past its timeout.
   */
  timedOut: boolean

  /**
   * Milliseconds from the root `beforeEach` to the end of the test's hooks.
   */
  duration: number

  /**
   * Whether the active mutant's site returned true in the process up to the end
   * of the try.
   */
  reached: boolean

  /**
   * Whether the try failed; failures the unit expects (`NodeTestUnit`) do not.
   */
  failed: boolean

  /**
   * Full name of the test with its suites, joined by `>`.
   */
  name: string

  /**
   * Site evaluations while the try ran.
   */
  hits: number

  /**
   * Number of the try in the process, in the order tries started.
   */
  seq: number

  /**
   * Kind of the record.
   */
  kind: 'try'
}

/**
 * Record of mootant's reporter, from the events node:test reports.
 */
export type NodeTestReport =
  | {
      /**
       * Kind of the record: a hook of the test file outside suites and tests,
       * such as a root `after`, failed. From Node 22 on plain `node` still
       * exits with 0 then, while `node --test` fails the file.
       */
      kind: 'root-hook'

      /**
       * First line of the hook's error, at most 200 code units.
       */
      message: string
    }
  | {
      /**
       * Whether it failed.
       */
      failed: boolean

      /**
       * Kind of the record: a todo test or suite ended. A failed one is what
       * `node --test` takes as the reason a test file that exits with a
       * non-zero code fails, and its failure never fails the file.
       */
      kind: 'todo'
    }
  | {
      /**
       * Kind of the record: a test or suite that is not todo failed, which
       * fails the run whatever todo tests did, as a suite whose `before` or
       * `after` hook failed.
       */
      kind: 'failure'
    }
