import type { RunKind } from './run-kind'

/**
 * What happens in a mutation run, as it happens; the command line turns these
 * into live progress. Events come in this order: `mutants`, `dry-start`, units
 * of the dry run, a `dry-again` before each later dry run, `dry-end`, then for
 * every later run of the test runner a `run-start` and its units. When tests
 * fail without mutants, `dry-failed` comes before the run throws. `verdicts`
 * comes whenever the counts of decided mutants change, from right before the
 * first `run-start` on; the last one counts the final results. `note` and
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
       * Serial chain of each unit, in plan order: units with the same number
       * share a test file and never run at the same time.
       */
      chains: number[]

      /**
       * Expected milliseconds of each unit of the plan, in plan order, from the
       * dry run: a unit that confirms a timeout costs its time limit. The start
       * of a process is left out, as every unit pays it alike.
       */
      costs: number[]

      /**
       * Units the run may execute at once.
       */
      workers: number

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
       * Mutants that survived every test file they have.
       */
      survived: number

      /**
       * Kind of the event: counts of the mutants decided so far, verdicts
       * reused from the cache included. A mutant counts once its verdict is
       * final: a timeout once it is confirmed, a survivor once its last test
       * file ran. A mutant that ends with `Error` because the test runner
       * evaluated it outside its workers counts as one from the start. Other
       * mutants no test reaches are left out.
       */
      kind: 'verdicts'

      /**
       * Mutants whose timeout is final.
       */
      timeout: number

      /**
       * Mutants killed.
       */
      killed: number

      /**
       * Mutants without a verdict, as when the test runner did not report them.
       */
      error: number
    }
  | {
      /**
       * Milliseconds the unit ran, from loading its test file to its end, when
       * the adapter reported it as the unit ended, else null.
       */
      duration: number | null

      /**
       * Index of the unit in the plan of the run, or null in the dry run and
       * when the adapter cannot tell.
       */
      unit: number | null

      /**
       * Kind of the event: a unit of the current run finished, such as one test
       * file of the dry run or one mutant in one test file.
       */
      kind: 'unit-end'
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
       * Kind of the event.
       */
      kind: 'dry-start'

      /**
       * Mutated files whose related tests run.
       */
      files: number
    }
