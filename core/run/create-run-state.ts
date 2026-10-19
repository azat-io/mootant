import type { LimitSettings, RunState } from '../../types/run/run-state'
import type { DryAnalysis } from '../../types/run/dry-analysis'
import type { RunEvent } from '../../types/run/run-event'
import type { Mutant } from '../../types/mutant/mutant'

import { indexModuleTests } from './index-module-tests'
import { classifyMutants } from './classify-mutants'
import { routeIsolated } from './route-isolated'

/**
 * What the batch and isolated phases start from.
 */
interface RunStateInput {
  /**
   * Absolute paths each test file imports through relative specifiers, by test
   * file path.
   */
  imports: ReadonlyMap<string, readonly string[]>

  /**
   * Receives the events of the run, such as the start of each run of the test
   * runner; when omitted, nothing counts the decided mutants as they come.
   */
  report?(event: RunEvent): void

  /**
   * Messages of the files whose mutants get no verdict, by display path.
   */
  errors: Map<string, string>

  /**
   * Pending mutants of the files of the run that the dry run hosted, selected
   * or not.
   */
  hosted: readonly Mutant[]

  /**
   * Coverage and stability of the dry run.
   */
  analysis: DryAnalysis

  /**
   * How try limits grow from the dry run.
   */
  limits: LimitSettings

  /**
   * Pending mutants of the run in file and canonical order.
   */
  mutants: Mutant[]

  /**
   * Test files expected to run at once.
   */
  workers: number

  /**
   * Whether the adapter can run batch plans.
   */
  batch: boolean

  /**
   * Whether the run is in fast mode; otherwise every covered mutant runs
   * isolated.
   */
  fast: boolean

  /**
   * Directory that display paths of diagnostics are relative to.
   */
  root: string
}

/**
 * Creates the state of the batch and isolated phases: every pending mutant with
 * its route from the dry run. Mutants of files that broke get an `Error`
 * verdict and no route.
 *
 * @param input - Mutants, dry run analysis, settings and failed files.
 * @returns State with no evidence yet.
 */
export function createRunState(input: RunStateInput): RunState {
  let { analysis, mutants, errors } = input
  let state: RunState = {
    live:
      input.report === undefined ?
        null
      : {
          counts: { survived: 0, timeout: 0, killed: 0, error: 0 },
          statuses: new Map(),
          outside: new Set(),
          preview: new Map(),
          reported: null,
          running: null,
        },
    moduleTests: indexModuleTests(input.hosted, analysis),
    report: input.report ?? (() => {}),
    workers: input.workers,
    imports: input.imports,
    limits: input.limits,
    mutants: new Map(),
    root: input.root,
    diagnostics: [],
    cache: null,
    analysis,
    runs: {},
  }
  let classes = classifyMutants(
    mutants.filter(mutant => !errors.has(mutant.file)),
    analysis,
    input,
  )
  for (let mutant of mutants) {
    let found = classes.get(mutant.id)
    let message = errors.get(mutant.file) ?? null
    state.mutants.set(mutant.id, {
      verdict:
        message === null ? null : (
          { status: 'Error', cause: null, file: null, test: null, message }
        ),
      queue: found?.path === 'batch' ? [...found.coveredBy] : [],
      path: found?.path === 'batch' ? 'batch' : null,
      coveredBy: found?.coveredBy ?? [],
      static: found?.static ?? false,
      isolatedBecause: null,
      evidence: new Map(),
      unitDuration: 0,
      survived: false,
      cached: false,
      duration: 0,
      confirm: [],
      ranked: [],
      files: [],
      tries: 0,
      units: 0,
      mutant,
    })
    if (found?.path === 'isolated') {
      routeIsolated(state, mutant.id, found.reason)
    }
  }
  return state
}
