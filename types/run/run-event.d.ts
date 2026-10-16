import type { RunKind } from './run-kind'

/**
 * What happens in a mutation run, as it happens; the command line turns these
 * into live progress. Events come in this order: `mutants`, `dry-start`, units
 * of the dry run, a `dry-again` before each later dry run, `dry-end`, then for
 * every later run of the test runner a `run-start` and its units. When tests
 * fail without mutants, `dry-failed` comes before the run throws. `note` and
 * `output` may come at any point.
 */
export type RunEvent =
  | {
      /**
       * Kind of the run, never `dry`.
       */
      run: Exclude<RunKind, 'dry'>

      /**
       * Kind of the event.
       */
      kind: 'run-start'

      /**
       * Distinct mutants the run tries.
       */
      mutants: number

      /**
       * Number of this run among the runs of its kind, from 1.
       */
      round: number

      /**
       * Units of the plan; one `unit-end` comes for each unit that finishes.
       */
      units: number
    }
  | {
      /**
       * Test file that wrote the text, relative to the project root with `/`
       * separators, or null when the test runner cannot tell, as for a process
       * warning.
       */
      file: string | null

      /**
       * Kind of the event.
       */
      kind: 'output'

      /**
       * Text the tests wrote, such as a `console.log` or a process warning,
       * ending with a line break.
       */
      text: string
    }
  | {
      /**
       * Mutants that ignore comments turned off.
       */
      ignored: number

      /**
       * Kind of the event.
       */
      kind: 'mutants'

      /**
       * Mutants of the run, ignored ones included.
       */
      total: number

      /**
       * Files with mutants.
       */
      files: number
    }
  | {
      /**
       * Kind of the event: tests fail without mutants, and the run stops.
       */
      kind: 'dry-failed'

      /**
       * Test files of the tests that fail without mutants, relative to the
       * project root with `/` separators, sorted.
       */
      files: string[]
    }
  | {
      /**
       * Milliseconds of the dry phase, every dry run included.
       */
      duration: number

      /**
       * Kind of the event.
       */
      kind: 'dry-end'

      /**
       * Tests the dry run ran.
       */
      tests: number
    }
  | {
      /**
       * Kind of the event: another dry run starts.
       */
      kind: 'dry-again'

      /**
       * Why the dry run runs again, such as tests to check without mutants.
       */
      message: string
    }
  | {
      /**
       * Sentence worth showing, such as how many tests are not repeatable.
       */
      message: string

      /**
       * Kind of the event.
       */
      kind: 'note'
    }
  | {
      /**
       * Kind of the event: a unit of the current run finished, such as one test
       * file of the dry run or one mutant in one test file.
       */
      kind: 'unit-end'
    }
  | {
      /**
       * Kind of the event.
       */
      kind: 'dry-start'

      /**
       * Mutated files whose related tests run.
       */
      files: number
    }
