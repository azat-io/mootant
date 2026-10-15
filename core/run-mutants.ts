import { availableParallelism } from 'node:os'

import type { BuiltInAdapters } from '../types/adapter/built-in-adapters'
import type { AdapterSession } from '../types/adapter/adapter-session'
import type { SwitchedFile } from '../types/adapter/switched-file'
import type { TestAdapter } from '../types/adapter/test-adapter'
import type { FileMutants } from '../types/mutant/file-mutants'
import type { Diagnostic } from '../types/mutant/diagnostic'
import type { DryAnalysis } from '../types/run/dry-analysis'
import type { RunConfig } from '../types/config/run-config'
import type { RunResult } from '../types/run/run-result'
import type { DryFile } from '../types/adapter/dry-file'
import type { RunState } from '../types/run/run-state'

import { createSwitchedFiles } from './instrument/create-switched-files'
import { getPackageDirectory } from './run/get-package-directory'
import { createWorkDirectory } from './run/create-work-directory'
import { markOutsideMutants } from './run/mark-outside-mutants'
import { runIsolatedRounds } from './run/run-isolated-rounds'
import { computeStaticCost } from './run/compute-static-cost'
import { listFileMutants } from './files/list-file-mutants'
import { getTestFileKey } from './run/get-test-file-key'
import { compareCodeUnits } from './compare-code-units'
import { runBatchPhases } from './run/run-batch-phases'
import { createRunState } from './run/create-run-state'
import { getDisplayPath } from './run/get-display-path'
import { selectRunFiles } from './run/select-run-files'
import { resolveAdapter } from './run/resolve-adapter'
import { decideResults } from './run/decide-results'
import { runDryPhase } from './run/run-dry-phase'
import { prepareRun } from './config/prepare-run'
import { readDryRun } from './run/read-dry-run'

/**
 * Options of a mutation run.
 */
interface RunMutantsOptions {
  /**
   * Receives notes worth printing while the run goes on: one line as each run
   * of the test runner starts, and in fast mode how many tests are not
   * repeatable.
   */
  onProgress?(message: string): void

  /**
   * Adapters that come with mootant; the command line passes them, so the core
   * never names a test runner.
   */
  builtIns: BuiltInAdapters

  /**
   * Ids of the only mutants to run (`--mutant`); every mutant when omitted.
   */
  mutantIds?: string[]

  /**
   * Most test files at once; over `run.concurrency`.
   */
  concurrency?: number

  /**
   * Lowest total score that passes; over `run.threshold`.
   */
  threshold?: number

  /**
   * Files and directories to mutate, relative to `cwd`; `run.paths`, relative
   * to the directory of the configuration, when empty.
   */
  paths: string[]

  /**
   * Path of the configuration file given with `--config`; searched for when
   * omitted.
   */
  config?: string

  /**
   * Preset that replaces the presets of the configuration.
   */
  preset?: string

  /**
   * Fast mode (`--fast`): batch runs first, with heuristic kills; over
   * `run.fast`.
   */
  fast?: boolean

  /**
   * Working directory of the run.
   */
  cwd: string
}

/**
 * Runs the mutants of the given paths against the project's tests: lists the
 * mutants, starts the test runner through its adapter, switches the mutated
 * files, runs the related tests without a mutant, then decides every covered
 * mutant on the isolated path, where each mutant gets a fresh module graph and
 * its whole covering test files. In fast mode, runtime mutants first take the
 * batch path, where one test run tries many mutants and kills are accepted as
 * heuristic verdicts; its survivors and doubtful tries still run isolated.
 * Mutants the test runner ran outside its workers end with `Error` unless a
 * test killed them. The adapter is closed and the work directory removed
 * whatever happens.
 *
 * @param options - Paths, configuration, adapters and run settings.
 * @returns Verdicts, diagnostics and timings, before they are formatted.
 * @throws Error - When the configuration, the paths, a `--mutant` id or the
 *   adapter is invalid, when the test runner cannot start, or when tests fail
 *   without mutants.
 */
export async function runMutants(
  options: RunMutantsOptions,
): Promise<RunResult> {
  let started = performance.now()
  let setup = await prepareRun(options)
  let { root, run } = setup
  let fromConfig = options.paths.length === 0
  let paths = fromConfig ? (run.paths ?? []) : options.paths
  if (paths.length === 0) {
    throw new Error('mootant run needs paths, such as "mootant run src".')
  }
  let listing = await listFileMutants({
    knownMutatorIds: setup.knownMutatorIds,
    cwd: fromConfig ? root : options.cwd,
    settings: setup.settings,
    mutators: setup.mutators,
    skipped: false,
    paths,
    root,
  })
  let files = selectMutants(listing.files, options.mutantIds)
  let adapter = await resolveAdapter(run.runner, root, options.builtIns)
  let work = await createWorkDirectory()
  try {
    let switched: SwitchedFile[] = []
    let session = await adapter.start({
      concurrency: options.concurrency ?? run.concurrency ?? null,
      workDirectory: work.path,
      files: switched,
      root,
    })
    try {
      return await execute({
        diagnostics: listing.diagnostics,
        switched,
        session,
        adapter,
        options,
        started,
        files,
        setup,
        run,
      })
    } finally {
      await session.close()
    }
  } finally {
    await work.remove()
  }
}

/**
 * Runs the phases of a started session.
 *
 * @param context - Session, switched file list, listing and settings.
 * @param context.diagnostics - Diagnostics of the listing.
 * @param context.session - Live test runner.
 * @param context.switched - Switched files given to the adapter, filled here.
 * @param context.adapter - Adapter of the session.
 * @param context.options - Options of the run.
 * @param context.started - Start time of the run.
 * @param context.files - Listed files with the selected mutants.
 * @param context.setup - Prepared configuration.
 * @param context.run - Run settings of the configuration.
 * @returns Result of the run.
 */
async function execute(context: {
  setup: Awaited<ReturnType<typeof prepareRun>>
  options: RunMutantsOptions
  diagnostics: Diagnostic[]
  switched: SwitchedFile[]
  session: AdapterSession
  adapter: TestAdapter
  files: FileMutants[]
  started: number
  run: RunConfig
}): Promise<RunResult> {
  let { session, options, setup, run } = context
  let { root } = setup
  let fast = options.fast ?? run.fast ?? false
  let selected = selectRunFiles(
    context.files,
    await session.listTestFiles(),
    getPackageDirectory(),
  )
  let diagnostics = [
    ...context.diagnostics,
    ...(session.diagnostics ?? []),
    ...selected.diagnostics,
  ]
  let built = createSwitchedFiles(selected.files)
  context.switched.push(...built.switched)
  diagnostics.push(...built.diagnostics)
  let errors = new Map<string, string>()
  for (let diagnostic of built.diagnostics) {
    errors.set(diagnostic.file!, diagnostic.message)
  }
  let mutants = selected.files.flatMap(file => file.mutants)
  let pending = mutants.filter(mutant => mutant.status === 'Pending')
  let displays = new Map(selected.files.map(file => [file.absolute, file.file]))
  let absolutes = new Map(
    selected.files.map(file => [file.file, file.absolute]),
  )

  let dryStarted = performance.now()
  let dryPhase = await runDryPhase(session, {
    mutantFiles: new Map(
      pending.map(mutant => [mutant.id, absolutes.get(mutant.file)!]),
    ),
    progress: message => options.onProgress?.(message),
    switched: context.switched,
    repeat: fast,
    displays,
    root,
  })
  diagnostics.push(...dryPhase.diagnostics)
  for (let [file, message] of dryPhase.errors) {
    errors.set(file, message)
  }
  let analysis = readDryRun(dryPhase.dry, dryPhase.unrepeatableFiles)
  if (fast) {
    diagnostics.push(
      ...reportFastLimits({
        unrepeatableFiles: dryPhase.unrepeatableFiles,
        files: dryPhase.dry.files,
        analysis,
        root,
      }),
    )
  }
  let state = createRunState({
    limits: {
      hitLimit: {
        floor: run.hitLimit?.floor ?? 100_000,
        factor: run.hitLimit?.factor ?? 100,
      },
      timeout: {
        constant: run.timeout?.constant ?? 250,
        factor: run.timeout?.factor ?? 3,
      },
    },
    workers:
      session.workers ??
      options.concurrency ??
      run.concurrency ??
      Math.max(1, availableParallelism() - 1),
    progress: message => options.onProgress?.(message),
    batch: context.adapter.batch,
    mutants: pending,
    analysis,
    errors,
    fast,
    root,
  })
  if (dryPhase.runs > 0) {
    state.runs.dry = dryPhase.runs
  }
  if (fast && analysis.unrepeatable.size > 0) {
    options.onProgress?.(describeUnrepeatable(state))
  }

  let batchStarted = performance.now()
  if (fast && context.adapter.batch) {
    await runBatchPhases(session, state)
  }
  let isolatedStarted = performance.now()
  await runIsolatedRounds(session, state)
  markOutsideMutants(state, dryPhase.dry.outside)
  let finished = performance.now()
  diagnostics.push(...state.diagnostics)

  return {
    timing: {
      batch: fast ? isolatedStarted - batchStarted : null,
      startup: dryStarted - context.started,
      isolated: finished - isolatedStarted,
      dryRun: batchStarted - dryStarted,
      total: finished - context.started,
    },
    unrepeatable:
      fast ? [...analysis.unrepeatable].toSorted(compareCodeUnits) : null,
    threshold: options.threshold ?? run.threshold ?? null,
    results: decideResults(state, mutants),
    staticCost: computeStaticCost(state),
    mode: fast ? 'fast' : 'isolated',
    runner: context.adapter.name,
    tests: dryPhase.dry.tests,
    mutators: setup.mutators,
    files: selected.files,
    preset: setup.preset,
    runs: state.runs,
    diagnostics,
    root,
  }
}

/**
 * Builds the warnings of the fast mode's heuristics: an `unrepeatable-test` for
 * every test whose two dry tries differed, or whose test file fails only when
 * each test runs twice, and a `config-overridden` for every test file with
 * tests marked concurrent, which the dry run and batch runs of fast mode run
 * one at a time.
 *
 * @param input - Dry run, its analysis and the project root.
 * @param input.unrepeatableFiles - Keys of the test files that failed only when
 *   their tests ran twice in a row.
 * @param input.files - Test files of the dry run.
 * @param input.analysis - Analysis of the dry run.
 * @param input.root - Directory display paths are relative to.
 * @returns Warnings in test file order.
 */
function reportFastLimits(input: {
  unrepeatableFiles: ReadonlySet<string>
  files: readonly DryFile[]
  analysis: DryAnalysis
  root: string
}): Diagnostic[] {
  let { unrepeatableFiles, analysis, root } = input
  let diagnostics: Diagnostic[] = []
  for (let file of input.files) {
    if (file.concurrent) {
      let display = getDisplayPath(file.file, root)
      diagnostics.push({
        message: `${display} has concurrent tests, which fast mode runs one at a time in the dry run and in batch runs; coverage and verdicts that depend on concurrency may be wrong, so run without --fast to keep them concurrent.`,
        code: 'config-overridden',
        severity: 'warning',
        file: display,
        column: null,
        line: null,
      })
    }
  }
  for (let id of analysis.unrepeatable) {
    let test = analysis.tests.get(id)!
    let display = getDisplayPath(test.file, root)
    diagnostics.push({
      message:
        unrepeatableFiles.has(getTestFileKey(test)) ?
          `"${test.name}" is in a test file that fails when each test runs twice and passes when each runs once; the mutants it reaches run isolated.`
        : `"${test.name}" gave different results in two runs without mutants; the mutants it reaches run isolated.`,
      code: 'unrepeatable-test',
      severity: 'warning',
      line: test.line,
      file: display,
      column: null,
    })
  }
  return diagnostics
}

/**
 * Keeps only the mutants given with `--mutant`, and only the files that still
 * have mutants.
 *
 * @param files - Listed files.
 * @param ids - Ids to keep, or undefined or empty to keep every mutant.
 * @returns Files with the selected mutants.
 * @throws Error - When an id is not among the listed mutants.
 */
function selectMutants(
  files: FileMutants[],
  ids: undefined | string[],
): FileMutants[] {
  if (ids === undefined || ids.length === 0) {
    return files
  }
  let known = new Set(files.flatMap(file => file.mutants.map(({ id }) => id)))
  let unknown = ids.find(id => !known.has(id))
  if (unknown !== undefined) {
    throw new Error(`Unknown mutant id "${unknown}".`)
  }
  let wanted = new Set(ids)
  return files
    .map(file => ({
      ...file,
      mutants: file.mutants.filter(mutant => wanted.has(mutant.id)),
    }))
    .filter(file => file.mutants.length > 0)
}

/**
 * Describes how many tests are not repeatable and how many mutants they send to
 * the isolated path.
 *
 * @param state - State of the run after classification.
 * @returns One line of progress.
 */
function describeUnrepeatable(state: RunState): string {
  let tests = state.analysis.unrepeatable.size
  let mutants = [...state.mutants.values()].filter(
    mutant => mutant.isolatedBecause === 'unrepeatable',
  ).length
  let counted = tests === 1 ? '1 test is' : `${tests} tests are`
  let reach = tests === 1 ? 'it reaches' : 'they reach'
  return mutants === 1 ?
      `${counted} not repeatable; the 1 mutant ${reach} runs isolated.`
    : `${counted} not repeatable; the ${mutants} mutants ${reach} run isolated.`
}
