import { availableParallelism } from 'node:os'

import type { BuiltInAdapters } from '../types/adapter/built-in-adapters'
import type { AdapterSession } from '../types/adapter/adapter-session'
import type { SwitchedFile } from '../types/adapter/switched-file'
import type { SinceRevision } from '../types/git/since-revision'
import type { TestAdapter } from '../types/adapter/test-adapter'
import type { FileMutants } from '../types/mutant/file-mutants'
import type { Diagnostic } from '../types/mutant/diagnostic'
import type { DryAnalysis } from '../types/run/dry-analysis'
import type { RunConfig } from '../types/config/run-config'
import type { RunResult } from '../types/run/run-result'
import type { DryFile } from '../types/adapter/dry-file'
import type { RunState } from '../types/run/run-state'
import type { RunEvent } from '../types/run/run-event'

import { createSwitchedFiles } from './instrument/create-switched-files'
import { getComponentFramework } from './parser/get-component-framework'
import { selectChangedMutants } from './files/select-changed-mutants'
import { loadSvelteCompiler } from './parser/load-svelte-compiler'
import { getPackageDirectory } from './run/get-package-directory'
import { createWorkDirectory } from './run/create-work-directory'
import { resolveMutantIds } from './identity/resolve-mutant-ids'
import { markOutsideMutants } from './run/mark-outside-mutants'
import { applyCachedBatch } from './cache/apply-cached-batch'
import { applyCachedUnits } from './cache/apply-cached-units'
import { runIsolatedRounds } from './run/run-isolated-rounds'
import { computeStaticCost } from './run/compute-static-cost'
import { loadVueCompiler } from './parser/load-vue-compiler'
import { prepareRunCache } from './cache/prepare-run-cache'
import { listFileMutants } from './files/list-file-mutants'
import { readChangedLines } from './git/read-changed-lines'
import { readTestImports } from './run/read-test-imports'
import { getTestFileKey } from './run/get-test-file-key'
import { compareCodeUnits } from './compare-code-units'
import { runBatchPhases } from './run/run-batch-phases'
import { createRunState } from './run/create-run-state'
import { getDisplayPath } from './run/get-display-path'
import { selectRunFiles } from './run/select-run-files'
import { resolveAdapter } from './run/resolve-adapter'
import { saveRunCache } from './cache/save-run-cache'
import { readRunCache } from './cache/read-run-cache'
import { getCachePath } from './cache/get-cache-path'
import { decideResults } from './run/decide-results'
import { runDryPhase } from './run/run-dry-phase'
import { prepareRun } from './config/prepare-run'
import { readDryRun } from './run/read-dry-run'

/**
 * Options of a mutation run.
 */
interface RunMutantsOptions {
  /**
   * Receives the events of the run as it goes on (see `RunEvent`): counts of
   * mutants, the start and end of the dry phase, the start of every later run
   * of the test runner, finished units, what the tests write and notes.
   */
  onProgress?(event: RunEvent): void

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
   * Whether to reuse verdicts of earlier runs and save the new ones (false with
   * `--no-cache`); over `run.cache`.
   */
  cache?: boolean

  /**
   * Git revision given with `--since`: only mutants on lines changed since its
   * merge base with `HEAD` run.
   */
  since?: string

  /**
   * Fast mode (`--fast`): batch runs first, with heuristic kills; over
   * `run.fast`. With an adapter without batch mode, the run notes it and
   * decides every mutant isolated.
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
 * files, checking that switched Svelte and Vue components compile, runs the
 * related tests without a mutant, then decides every covered mutant on the
 * isolated path, where each mutant gets a fresh module graph and its whole
 * covering test files. In fast mode, runtime mutants first take the batch path,
 * where one test run tries many mutants and kills are accepted as heuristic
 * verdicts; its survivors and doubtful tries still run isolated. An adapter
 * without batch mode runs fast mode as the default mode, with a note. Mutants
 * the test runner ran outside its workers end with `Error` unless a test killed
 * them. Unless the cache is off, valid verdicts of earlier runs are reused
 * before anything runs, and the evidence of the run is saved after it, unless
 * it has error diagnostics. With `--since`, only the mutants on lines changed
 * since the merge base of the revision and `HEAD` run, and when there are none
 * the test runner does not start. The adapter is closed and the work directory
 * removed whatever happens.
 *
 * @param options - Paths, configuration, adapters and run settings.
 * @returns Verdicts, diagnostics and timings, before they are formatted.
 * @throws Error - When the configuration, the paths, a `--mutant` id or the
 *   adapter is invalid, when the changed lines cannot be read from git, when
 *   the test runner cannot start, or when tests fail without mutants.
 */
export async function runMutants(
  options: RunMutantsOptions,
): Promise<RunResult> {
  let started = performance.now()
  let startedAt = Date.now()
  let setup = await prepareRun(options)
  let { root, run } = setup
  let requestedFast = options.fast ?? run.fast ?? false
  let threshold = options.threshold ?? run.threshold ?? null
  let fromConfig = options.paths.length === 0
  let paths = fromConfig ? (run.paths ?? []) : options.paths
  if (paths.length === 0) {
    throw new Error('mootant run needs paths, such as "mootant run src".')
  }
  let changes =
    options.since === undefined ?
      null
    : await readChangedLines(root, options.since)
  let since: SinceRevision | null =
    changes === null ? null : { ref: options.since!, base: changes.base }
  let listing = await listFileMutants({
    knownMutatorIds: setup.knownMutatorIds,
    cwd: fromConfig ? root : options.cwd,
    settings: setup.settings,
    mutators: setup.mutators,
    skipped: false,
    paths,
    root,
  })
  let files = selectMutants({
    changed:
      changes === null ?
        listing.files
      : selectChangedMutants(listing.files, changes.files),
    ids: options.mutantIds,
    listed: listing.files,
    since,
  })
  let mutants = files.flatMap(file => file.mutants)
  let listedIds = listing.files.flatMap(file =>
    file.mutants.map(mutant => mutant.id),
  )
  /**
   * Passes an event of the run on, when someone listens.
   *
   * @param event - Event to pass on.
   */
  function report(event: RunEvent): void {
    options.onProgress?.(event)
  }
  report({
    ignored: mutants.filter(mutant => mutant.status === 'Ignored').length,
    files: files.filter(file => file.mutants.length > 0).length,
    total: mutants.length,
    kind: 'mutants',
  })
  let resolved = await resolveAdapter(run.runner, root, options.builtIns)
  let { adapter } = resolved
  if (resolved.note !== null) {
    report({ message: resolved.note, kind: 'note' })
  }
  let fast = requestedFast && adapter.batch
  if (requestedFast && !adapter.batch) {
    report({
      message: `${adapter.name} has no batch mode, so fast mode runs every mutant isolated, as a run without --fast does.`,
      kind: 'note',
    })
  }
  if (since !== null && mutants.length === 0) {
    let total = performance.now() - started
    return {
      timing: {
        batch: fast ? 0 : null,
        startup: total,
        isolated: 0,
        dryRun: 0,
        total,
      },
      diagnostics: listing.diagnostics,
      mode: fast ? 'fast' : 'isolated',
      unrepeatable: fast ? [] : null,
      mutators: setup.mutators,
      runner: adapter.name,
      preset: setup.preset,
      runnerVersion: null,
      staticCost: [],
      cache: false,
      results: [],
      listedIds,
      tests: [],
      threshold,
      runs: {},
      files,
      since,
      root,
    }
  }
  let work = await createWorkDirectory()
  try {
    let switched: SwitchedFile[] = []
    let session = await adapter.start({
      onOutput: (text, file) => {
        report({
          file: file === null ? null : getDisplayPath(file, root),
          kind: 'output',
          text,
        })
      },
      onUnitEnd: () => {
        report({ kind: 'unit-end' })
      },
      concurrency: options.concurrency ?? run.concurrency ?? null,
      workDirectory: work.path,
      files: switched,
      root,
    })
    try {
      return await execute({
        diagnostics: listing.diagnostics,
        startedAt,
        listedIds,
        threshold,
        switched,
        session,
        adapter,
        options,
        started,
        files,
        since,
        setup,
        fast,
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
 * @param context.startedAt - Start of the run in milliseconds since the epoch.
 * @param context.files - Listed files with the selected mutants.
 * @param context.listedIds - Ids of every listed mutant of the paths.
 * @param context.threshold - Lowest total score that passes, or null.
 * @param context.since - Revision of `--since` with its merge base, or null.
 * @param context.fast - Whether the run is in fast mode, which needs an adapter
 *   with batch mode.
 * @param context.setup - Prepared configuration.
 * @param context.run - Run settings of the configuration.
 * @returns Result of the run.
 */
async function execute(context: {
  setup: Awaited<ReturnType<typeof prepareRun>>
  since: SinceRevision | null
  options: RunMutantsOptions
  diagnostics: Diagnostic[]
  threshold: number | null
  switched: SwitchedFile[]
  session: AdapterSession
  adapter: TestAdapter
  files: FileMutants[]
  listedIds: string[]
  startedAt: number
  started: number
  run: RunConfig
  fast: boolean
}): Promise<RunResult> {
  let { session, options, setup, fast, run } = context
  let { root } = setup
  let cachePath = getCachePath(root)
  let stored =
    (options.cache ?? run.cache ?? true) ? readRunCache(cachePath) : null
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
  let frameworks = new Set(
    selected.files.map(file => getComponentFramework(file.file)),
  )
  let built = createSwitchedFiles(selected.files, {
    svelte: frameworks.has('svelte') ? await loadSvelteCompiler() : null,
    vue: frameworks.has('vue') ? await loadVueCompiler() : null,
  })
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
    report: event => options.onProgress?.(event),
    switched: context.switched,
    repeat: fast,
    displays,
    root,
  })
  options.onProgress?.({
    duration: performance.now() - dryStarted,
    tests: dryPhase.dry.tests.length,
    kind: 'dry-end',
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
  let limits = {
    hitLimit: {
      floor: run.hitLimit?.floor ?? 100_000,
      factor: run.hitLimit?.factor ?? 100,
    },
    timeout: {
      constant: run.timeout?.constant ?? 250,
      factor: run.timeout?.factor ?? 3,
    },
  }
  let now = Date.now()
  let cache =
    stored === null ? null : (
      await prepareRunCache({
        started: context.startedAt,
        adapter: context.adapter,
        files: selected.files,
        dry: dryPhase.dry,
        analysis,
        session,
        stored,
        limits,
        setup,
        root,
        now,
      })
    )
  let state = createRunState({
    workers:
      session.workers ??
      options.concurrency ??
      run.concurrency ??
      Math.max(1, availableParallelism() - 1),
    imports: await readTestImports(
      [...analysis.testFiles.values()].map(entry => entry.file),
    ),
    report: event => options.onProgress?.(event),
    batch: context.adapter.batch,
    mutants: pending,
    analysis,
    limits,
    errors,
    fast,
    root,
  })
  if (dryPhase.runs > 0) {
    state.runs.dry = dryPhase.runs
  }
  state.cache = cache
  if (fast && analysis.unrepeatable.size > 0) {
    options.onProgress?.({ message: describeUnrepeatable(state), kind: 'note' })
  }
  if (fast) {
    applyCachedBatch(state)
  }
  applyCachedUnits(state)
  let cached = [...state.mutants.values()].filter(
    mutant => mutant.cached,
  ).length
  if (cached > 0) {
    options.onProgress?.({
      message:
        cached === 1 ?
          `Reused a cached verdict for 1 of ${state.mutants.size} mutants.`
        : `Reused cached verdicts for ${cached} of ${state.mutants.size} mutants.`,
      kind: 'note',
    })
  }

  let batchStarted = performance.now()
  if (fast) {
    await runBatchPhases(session, state)
    applyCachedUnits(state)
  }
  let isolatedStarted = performance.now()
  await runIsolatedRounds(session, state)
  markOutsideMutants(state, dryPhase.dry.outside)
  diagnostics.push(...state.diagnostics)
  if (cache !== null) {
    let skipped = await saveRunCache({
      failed: [
        ...diagnostics,
        ...context.files.flatMap(file => file.diagnostics),
      ].some(diagnostic => diagnostic.severity === 'error'),
      started: context.startedAt,
      file: cachePath,
      cache,
      root,
      now,
    })
    if (skipped !== null) {
      diagnostics.push(skipped)
    }
  }
  let finished = performance.now()

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
    results: decideResults(state, mutants),
    runnerVersion: session.version ?? null,
    staticCost: computeStaticCost(state),
    mode: fast ? 'fast' : 'isolated',
    threshold: context.threshold,
    listedIds: context.listedIds,
    runner: context.adapter.name,
    tests: dryPhase.dry.tests,
    mutators: setup.mutators,
    cache: cache !== null,
    files: selected.files,
    since: context.since,
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
 * have mutants. Ids are resolved against every listed mutant, so an id means
 * the same with and without `--since`.
 *
 * @param selection - What to select from.
 * @param selection.changed - Listed files with only the mutants on changed
 *   lines with `--since`, or every listed file.
 * @param selection.ids - Ids or unique id prefixes to keep, or undefined or
 *   empty to keep every mutant.
 * @param selection.listed - Every listed file.
 * @param selection.since - Revision of `--since`, or null.
 * @returns Files with the selected mutants.
 * @throws Error - When an id or id prefix does not name exactly one listed
 *   mutant, or names one that is not on a changed line.
 */
function selectMutants(selection: {
  since: SinceRevision | null
  ids: undefined | string[]
  changed: FileMutants[]
  listed: FileMutants[]
}): FileMutants[] {
  let { changed, listed, since, ids } = selection
  if (ids === undefined || ids.length === 0) {
    return changed
  }
  let resolved = resolveMutantIds(
    ids,
    listed.flatMap(file => file.mutants),
  )
  let selectable = new Set(
    changed.flatMap(file => file.mutants.map(mutant => mutant.id)),
  )
  for (let [index, id] of resolved.entries()) {
    if (!selectable.has(id)) {
      throw new Error(
        `Mutant "${ids[index]}" is not on a line changed since ${since!.ref}; drop --since to run it.`,
      )
    }
  }
  let wanted = new Set(resolved)
  return changed
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
