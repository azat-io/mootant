import type { ErrorRealm } from './error-realm'

/**
 * One line of the out file of a unit, as code in a worker hands it to the
 * channel, which adds `time`, epoch milliseconds of a clock no test can reach,
 * to every line.
 */
export type JestRecord =
  | {
      /**
       * Whether the file failed, had no test, or gave a result.
       */
      outcome: 'failure' | 'result' | 'empty'

      /**
       * Jest's text of a failing file, or null.
       */
      failureMessage: string | null

      /**
       * Line of each test by its full name.
       */
      lines: Record<string, number>

      /**
       * What tests printed to a console that kept it, as Jest's reporters show
       * it under the file, or null when they printed nothing there or the unit
       * has a mutant, whose output nobody reads.
       */
      consoleOutput: string | null

      /**
       * First line of the `stack` of the `testExecError` Jest reported for the
       * file, whose `message` is always empty, or null without one.
       */
      execError: string | null

      /**
       * Where the failure of the file comes from, or null without one.
       */
      realm: ErrorRealm | null

      /**
       * First line of the failure of the file, or null.
       */
      message: string | null

      /**
       * Files and directories that count, as the reads do, sorted, which the
       * project's transformers read in the unit, or something read before the
       * vm was set up, as the test environment and the test runner load then,
       * the test file aside, or in the calls of the test environment and the
       * real test runner (`WorkerCalls.environment`), or what the project's own
       * resolver read, a file it only looked for too. They are among the reads
       * only when code in the vm outside those calls read them too: a warm
       * worker does not read them again, as Jest keeps what a transformer gave
       * and what it resolved, a transformer keeps what it read, such as its
       * configuration, and Node keeps the modules of the environment.
       */
      transforms: string[]

      /**
       * Names of the environment variables the code read, `*` for a listing.
       */
      variables: string[]

      /**
       * Ids of the sites that ran in the worker's own realm.
       */
      outside: string[]

      /**
       * Snapshots of the file that went unchecked or did not match, which fail
       * a run of Jest with every test passing.
       */
      snapshots: number

      /**
       * Ids of the sites evaluated outside tests and in concurrent tests.
       */
      covers: string[]

      /**
       * Files and directories the code read and then changed itself, sorted,
       * whose contents the cache compares.
       */
      writes: string[]

      /**
       * Files of the CommonJS modules the worker's own realm loaded so far that
       * count, as the reads do, sorted: transformers, test environments,
       * resolvers and what they import, which a warm worker no longer reads.
       */
      loaded: string[]

      /**
       * Whether `reads` holds every file the code read through `node:fs`, which
       * it does not when graceful-fs loaded before the read tracker.
       */
      tracked: boolean

      /**
       * Reasons the worker's shared state is no longer clean, from the guard.
       */
      dirty: string[]

      /**
       * Files and directories the code read that count, sorted: under the
       * project root or a project's directories, or with an extension of a
       * module or a snapshot outside the temporary directory, never under
       * `node_modules` or mootant's files. Neither what the resolver read nor
       * what only a transformer read is among them.
       */
      reads: string[]

      /**
       * Kind of the record: the unit ended.
       */
      kind: 'finish'

      /**
       * Site evaluations of the unit.
       */
      hits: number
    }
  | {
      /**
       * Where the failure comes from, or null when the test passed.
       */
      realm: ErrorRealm | null

      /**
       * Ids of the sites evaluated in this attempt, sorted, in a dry file that
       * is not concurrent; else null, and null for errors that came late.
       */
      covers: string[] | null

      /**
       * First line of the failure, at most 200 code units, or null when the
       * test passed.
       */
      message: string | null

      /**
       * Earlier tests of the file with the same full name.
       */
      occurrence: number

      /**
       * Whether the test failed by running past its timeout.
       */
      timedOut: boolean

      /**
       * Milliseconds of the attempt.
       */
      duration: number

      /**
       * Whether the active mutant was reached in the unit by the end of the
       * attempt.
       */
      reached: boolean

      /**
       * Whether the attempt failed.
       */
      failed: boolean

      /**
       * Full name of the test with its blocks, joined by `>`.
       */
      name: string

      /**
       * Site evaluations in this attempt.
       */
      hits: number

      /**
       * Kind of the record: an attempt of a test ended, or errors came to a
       * test after its last attempt passed, with no hits and no duration.
       */
      kind: 'try'
    }
  | {
      /**
       * Earlier tests of the file with the same full name.
       */
      occurrence: number

      /**
       * Milliseconds the attempt may run.
       */
      timeout: number

      /**
       * Full name of the test with its blocks, joined by `>`.
       */
      name: string

      /**
       * Kind of the record: an attempt of a test started.
       */
      kind: 'open'
    }
  | {
      /**
       * Hook that failed.
       */
      type: 'beforeAll' | 'afterAll'

      /**
       * Whether the hook failed by running past its timeout.
       */
      timedOut: boolean

      /**
       * First line of the failure, at most 200 code units.
       */
      message: string

      /**
       * Kind of the record: a hook of a block failed.
       */
      kind: 'hook'
    }
  | {
      /**
       * Kind of the record: the tracker threw, so the facts of the unit are not
       * whole.
       */
      kind: 'tracker-error'

      /**
       * First line of the tracker's error, at most 200 code units.
       */
      message: string

      /**
       * Name of the event the tracker failed on.
       */
      event: string
    }
  | {
      /**
       * Ids of the sites evaluated while the file loaded, sorted.
       */
      covers: string[]

      /**
       * Site evaluations while the file loaded.
       */
      hits: number

      /**
       * Kind of the record: the file loaded and its tests are about to run.
       */
      kind: 'load'
    }
  | {
      /**
       * Kind of the record: the transformer failed on a switched text.
       */
      kind: 'rejected'

      /**
       * First line of the transformer's error, at most 200 code units.
       */
      message: string

      /**
       * Absolute path of the file.
       */
      file: string
    }
  | {
      /**
       * Kind of the record: a switched file whose text was served, or whose
       * loaded text differed from the original.
       */
      kind: 'mismatched' | 'served'

      /**
       * Absolute path of the file.
       */
      file: string
    }
  | {
      /**
       * First line of the error, at most 200 code units.
       */
      message: string

      /**
       * Kind of the record: an error of a unit that ended showed up in this
       * one.
       */
      kind: 'stale'
    }
  | {
      /**
       * Kind of the record: the active mutant was reached for the first time.
       */
      kind: 'reached'

      /**
       * Site evaluations of the unit at the first reach.
       */
      hits: number
    }
  | {
      /**
       * Milliseconds the hook may run.
       */
      timeout: number

      /**
       * Kind of the record: a hook started in a dry run.
       */
      kind: 'beat'
    }
  | {
      /**
       * Kind of the record: the file defines a concurrent test.
       */
      kind: 'concurrent'
    }
  | {
      /**
       * Kind of the record: the unit started.
       */
      kind: 'start'
    }
