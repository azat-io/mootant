import type {
  SerializedConfig,
  RunnerTestSuite,
  RunnerTestCase,
  RunnerTestFile,
  RunnerTask,
} from 'vitest'

import { writeFileSync, closeSync, openSync, rmSync } from 'node:fs'
import { builtinEnvironments } from 'vitest/runtime'
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import { TestRunner } from 'vitest'
import path from 'node:path'

import type { BatchUnit, BatchTest } from '../../types/adapter/batch-plan'
import type { MutantRuntime } from '../../types/adapter/mutant-runtime'
import type { IsolatedUnit } from '../../types/adapter/isolated-plan'
import type { VitestWorkerOptions } from './types/vitest-worker'
import type { TryFacts } from '../../types/adapter/try-facts'

import { installMutantRuntime } from '../../core/runtime/install-mutant-runtime'
import { watchWorkerClose } from './worker/watch-worker-close'
import { trackEnvironment } from './worker/track-environment'
import { listDependencies } from './worker/list-dependencies'
import { getErrorMessage } from './worker/get-error-message'
import { trackFileReads } from './worker/track-file-reads'
import { readWorkerPlan } from './worker/read-worker-plan'
import { raceTryTimeout } from './worker/race-try-timeout'
import { writeOutRecord } from './worker/write-out-record'
import { installTryHook } from './worker/install-try-hook'
import { writeHeartbeat } from './worker/write-heartbeat'
import { findHookError } from './worker/find-hook-error'
import { getHookBudget } from './worker/get-hook-budget'
import { readTryFacts } from './worker/read-try-facts'
import { captureClock } from './worker/capture-clock'
import { getFileHash } from './worker/get-file-hash'
import { waitForTurn } from './worker/wait-for-turn'
import { orderTests } from './worker/order-tests'
import { claimUnit } from './worker/claim-unit'
import { listTests } from './worker/list-tests'

/**
 * State of the try that runs now, or that ended and waits for its teardown. A
 * try is one run of the test as a plain run of Vitest makes it: every
 * repetition of the test's own `repeats`, each with its own retries.
 */
interface CurrentTry {
  /**
   * `fail` or `skip` when a repetition that finished ended with it, else
   * undefined. A skip ends the test, so a later repetition never hides it.
   */
  outcome: undefined | string

  /**
   * Ids of the mutant sites evaluated while the try ran, in a dry run; null
   * otherwise. Sites evaluated while concurrent tries ran count for each.
   */
  covers: Set<string> | null

  /**
   * State of the test after the `afterEach` hooks of the attempt that runs now,
   * or undefined before them.
   */
  state: undefined | string

  /**
   * Milliseconds on the captured clock by which the test function must settle,
   * or null for no limit.
   */
  deadline: number | null

  /**
   * Test of the try.
   */
  test: RunnerTestCase

  /**
   * Repetitions of the try that finished.
   */
  repetitions: number

  /**
   * Whether mootant's timer fired before the test function settled.
   */
  timedOut: boolean

  /**
   * Errors of the last attempt of every repetition that finished; errors of an
   * attempt Vitest retried are left out, as a plain run does.
   */
  errors: unknown[]

  /**
   * Unhandled errors while the try ran.
   */
  strays: string[]

  /**
   * Retries Vitest had counted for the test when the attempt started.
   */
  retries: number

  /**
   * Start time of the try on the captured clock.
   */
  started: number

  /**
   * Errors of the test's result before the attempt that runs now started.
   */
  attempt: number

  /**
   * Time on the captured clock until which the watchdog lets the attempt that
   * runs now go on, in a dry run.
   */
  watch: number

  /**
   * Site evaluations counted before the try started.
   */
  hits: number
}

/**
 * A test that started and whose tries are not yet written.
 */
interface TestRecord {
  /**
   * Try that runs now, or that ended and waits for its teardown, or null.
   */
  current: CurrentTry | null

  /**
   * Active mutant of each try of the test; null is a control try.
   */
  plan: (string | null)[]

  /**
   * Test of the record.
   */
  test: RunnerTestCase

  /**
   * Facts of the tries that finished.
   */
  tries: TryFacts[]

  /**
   * Repetitions in one try: the test's own `repeats` plus one.
   */
  group: number

  /**
   * Number of the next try.
   */
  next: number
}

/**
 * Receiver of the stray errors of the process: the runner of the file that runs
 * now.
 */
interface StraySlot {
  /**
   * Runner that records stray errors.
   */
  current: MootantRunner
}

/**
 * Milliseconds the watchdog waits past a budget before it stops a worker.
 */
const HANG_GRACE = 1000

/**
 * Longest budget a heartbeat carries, about 24 days: an unlimited budget, as
 * for a hook without a timeout, never stops the worker.
 */
const MAX_BUDGET = 2 ** 31 - 1

/**
 * Global slot that keeps one pair of process listeners per worker process.
 */
const STRAY_SLOT = Symbol.for('mootant.vitest.strays')

/**
 * Timers of the worker, captured when the runner loads: before setup files and
 * tests can install fake timers.
 */
let clock = captureClock()

/**
 * Vitest runner of mootant's workers. In a dry run it runs every test once, or
 * twice in a row with `repeat`, and records which mutant sites each try
 * evaluated. In a batch run it claims one unit of the test file and tries the
 * planned mutants test by test, switching the active mutant between tries, with
 * a control try without a mutant before and after every mutant try. In an
 * isolated run it claims one unit and keeps its mutant active from the start of
 * loading through the whole file, its teardown included. A unit ends only after
 * the worker's teardown: Vitest cleans up the worker-scoped fixtures, then
 * tears the test environment down; errors of both count as a failed suite hook,
 * and the heartbeat covers both, so a hang there stops the worker. What the
 * code reads is recorded until the unit ends, so files and environment
 * variables read in that teardown are inputs of the unit like those its tests
 * read; a teardown step that runs after the unit ended, as the test
 * environment's when the worker's teardown cannot be watched, counts for
 * neither. A test environment other than Vitest's own loads and sets up before
 * the runner exists, out of sight, so its units report no dependencies and are
 * never cached. A unit waits until the worker of the unit before it of the same
 * test file is gone, so a test file never runs twice at once.
 *
 * Tests the user marked concurrent stay concurrent in isolated units and in a
 * dry run that tries each test once, as in a plain run; a batch run and a dry
 * run that repeats tests run them one at a time, as one active mutant must not
 * overlap another and batch plans follow the dry run's order. Where tries
 * overlap, the runner keeps them per test: sites evaluated, unhandled errors
 * and, in an isolated unit, whether the mutant was reached count for every try
 * that runs at that moment.
 *
 * A try is one run of the test as a plain Vitest run makes it: the runner
 * multiplies the test's own `repeats` and keeps its `retry`, so a try is every
 * repetition of the test, and a repetition passes when an attempt passes. Each
 * attempt starts in an `aroundEach` hook the runner puts outside every other
 * hook, and a try's facts are read once Vitest finished it: when the next try
 * of the test starts, when the test ends, or, after a skip, at the next test or
 * suite. So errors of `aroundEach` teardown and fixture cleanup count, and the
 * try's mutant stays active until then. The active mutant is a global of the
 * worker process that the runner switches between tries (an environment
 * variable cannot change inside a running worker); switched code reads it on
 * every evaluation. Facts go to out files in the work directory, one line per
 * test; heartbeats let the main process stop a worker that hangs, dry runs
 * included.
 */
export default class MootantRunner extends TestRunner {
  /**
   * Coverage the runtime writes to while several tries of a dry run overlap:
   * each site counts for every one of them.
   */
  private readonly coverSink = {
    add: (id: string): void => {
      for (let covers of this.activeCovers) {
        covers.add(id)
      }
    },
  }

  /**
   * Project files the test code read through `node:fs` while the unit ran, its
   * teardown included, those it wrote, which are no inputs when it reads them
   * later, the paths it changed with the directories they are in, and the
   * environment variables it read; null while nothing records.
   */
  private inputs: {
    environment: Set<string>
    written: Set<string>
    touched: Set<string>
    files: Set<string>
  } | null = null

  /**
   * Mutant runtime the switched code calls.
   */
  private readonly runtime: MutantRuntime = installMutantRuntime()

  /**
   * Tests that started and whose tries are not yet written; several at once
   * when the user's tests run concurrently.
   */
  private readonly records = new Map<RunnerTestCase, TestRecord>()

  /**
   * Milliseconds the hooks around each test may take by Vitest's own hook
   * timeouts, by test id; filled in a dry run.
   */
  private readonly hookBudgets = new Map<string, number>()

  /**
   * Planned tests of the batch unit, by id.
   */
  private readonly planned = new Map<string, BatchTest>()

  /**
   * Mutant sites evaluated outside tries in a dry run.
   */
  private readonly loadCovers = new Set<string>()

  /**
   * Site evaluations while tries of a dry run ran, and the count when the
   * current stretch of tries began.
   */
  private readonly inside = { hits: 0, from: 0 }

  /**
   * Options the main process provided for this run.
   */
  private readonly options: VitestWorkerOptions

  /**
   * What the test file depended on (`listDependencies`) when its file suite
   * ended, its snapshot files included, read before Vitest drops its snapshot
   * state, or null before; the end of the unit adds what its teardown read.
   */
  private dependencies: string[] | null = null

  /**
   * Descriptor of the heartbeat file, or null until the first beat.
   */
  private beatDescriptor: number | null = null

  /**
   * Mutants a try of this unit already failed with; they are not tried again.
   */
  private readonly killed = new Set<string>()

  /**
   * Ids of the tests that run, or null to run every test.
   */
  private runnable: Set<string> | null = null

  /**
   * Unhandled errors outside tries.
   */
  private readonly loadStrays: string[] = []

  /**
   * Coverage sets of the tries that run now, in a dry run.
   */
  private activeCovers: Set<string>[] = []

  /**
   * Id of the mutant active in the last try, or null.
   */
  private lastMutant: string | null = null

  /**
   * Message of the first failed suite hook or of the failed cleanup of the
   * worker-scoped fixtures, or null.
   */
  private hookError: string | null = null

  /**
   * Message of the load failure, or null.
   */
  private loadError: string | null = null

  /**
   * Unit of a batch run, or null.
   */
  private batch: BatchUnit | null = null

  /**
   * Id of the test of the last try, or null before the first one.
   */
  private lastTest: string | null = null

  /**
   * Name of the claimed unit, `<hash>-<n>`, or null in a dry run and when the
   * worker claimed no unit.
   */
  private unitName: string | null = null

  /**
   * Whether suites and tests run one at a time even where the user marked them
   * concurrent: in a batch run and in a dry run that tries each test twice.
   */
  private readonly sequential: boolean

  /**
   * Names of the environment variables the unit read, `*` for all of them,
   * sorted; read when the unit ends.
   */
  private environment: string[] = []

  /**
   * Descriptor of the out file of this unit, open for appending, or null when
   * the worker claimed no unit.
   */
  private out: number | null = null

  /**
   * Heartbeat file of this worker.
   */
  private readonly beatFile: string

  /**
   * Files and directories the test code read and changed itself while the unit
   * ran, sorted; read when the unit ends.
   */
  private modified: string[] = []

  /**
   * Whether the unit ends in the worker's teardown, after Vitest cleaned up the
   * worker-scoped fixtures; false when Vitest offers no teardown hook.
   */
  private endsInTeardown = false

  /**
   * Whether the unit ends only once the worker's teardown finished, the test
   * environment's teardown included; false when the worker's teardown cannot be
   * watched, so the unit ends after the cleanup of the worker-scoped fixtures.
   */
  private endsOnClose = false

  /**
   * Whether every test file ran and only the teardown is left.
   */
  private filesEnded = false

  /**
   * Whether a collected suite or test was marked concurrent.
   */
  private concurrent = false

  /**
   * Whether a try ran out of time, so the rest of the unit is skipped.
   */
  private abandoned = false

  /**
   * Milliseconds the work outside tries of a dry run may take after loading:
   * the file budget plus the time Vitest allows the file's suite hooks.
   */
  private outsideBudget = 0

  /**
   * Milliseconds from the start of loading to the end of collection.
   */
  private loadDuration = 0

  /**
   * Site evaluations outside tries of a batch run, which resets the counter at
   * every try.
   */
  private outsideHits = 0

  /**
   * Length of the text in the heartbeat file.
   */
  private beatLength = 0

  /**
   * Index of the unit in the run's plan.
   */
  private unitIndex = 0

  /**
   * Name of the out file without its extension, which also names the file that
   * marks the unit as finished; empty when the worker claimed no unit.
   */
  private outName = ''

  /**
   * Number of the last heartbeat.
   */
  private sequence = 0

  /**
   * Start of loading on the captured clock.
   */
  private started = 0

  /**
   * Milliseconds the whole unit may take.
   */
  private budget = 0

  /**
   * Absolute path of the test file.
   */
  private file = ''

  /**
   * Creates the runner of one test file, installs the mutant runtime, records
   * the worker's process id, so the main process waits until the worker is
   * gone, and moves the end of the unit to the end of the worker's teardown,
   * after the test environment's teardown, whose error fails the unit like a
   * failed suite hook.
   *
   * @param config - Serialized configuration of the project.
   */
  public constructor(config: SerializedConfig) {
    super(config)
    this.options = this.injectValue('mootant') as VitestWorkerOptions
    let { directory, repeat, mode } = this.options
    this.sequential = mode === 'batch' || (mode === 'dry' && repeat)
    this.beatFile = path.join(directory, 'beat', `${process.pid}.json`)
    closeSync(
      openSync(path.join(directory, 'worker', String(process.pid)), 'w'),
    )
    listenForStrays(this)
    let register = this.onCleanupWorkerContext
    if (register !== undefined) {
      let state = Reflect.get(this, 'workerState') as { ctx: object }
      let onClose = watchWorkerClose(Reflect.get(state.ctx, 'traces'))
      this.onCleanupWorkerContext = cleanup => {
        this.endsInTeardown = true
        if (onClose !== null) {
          this.endsOnClose = true
          onClose(failure => {
            if (failure !== null) {
              this.hookError ??= getErrorMessage(failure.error)
            }
            this.finishUnit()
          })
        }
        register(() => this.tearDown(cleanup))
      }
    }
  }

  /**
   * Claims a unit, waits for the unit before it of the same test file, and
   * prepares the runtime before the test file and its setup files load. Vitest
   * awaits this hook once per test file.
   *
   * @param paths - Absolute path of the test file.
   */
  public async onBeforeCollect(paths: string[]): Promise<void> {
    let { runtime, options } = this
    let file = paths[0]!
    this.file = file
    this.started = clock.now()
    runtime.hitLimit = Infinity
    runtime.coverage = null
    runtime.reached = false
    runtime.active = null
    runtime.hits = 0
    let hash = getFileHash(file, this.config.name ?? '')
    let out = path.join(options.directory, 'out')
    if (options.mode === 'dry') {
      runtime.coverage = this.loadCovers
      this.outName = `${hash}-${process.pid}`
      this.out = openSync(path.join(out, `${this.outName}.jsonl`), 'a')
      this.beat(options.timeouts!.file, null)
      this.startTracking(true)
      return
    }
    let plan = readWorkerPlan(options.directory, hash)
    let index =
      plan === null ? null : (
        claimUnit(options.directory, hash, plan.units.length)
      )
    if (index === null) {
      this.runnable = new Set()
      return
    }
    this.unitName = `${hash}-${index}`
    await waitForTurn(options.directory, { index, hash }, clock)
    this.started = clock.now()
    this.unitIndex = plan!.indexes[index]!
    this.outName = this.unitName
    this.out = openSync(path.join(out, `${this.outName}.jsonl`), 'a')
    let hookTimeout =
      this.config.hookTimeout > 0 ? this.config.hookTimeout : Infinity
    if (options.mode === 'isolated') {
      let unit = plan!.units[index] as IsolatedUnit
      runtime.active = unit.mutant
      runtime.hitLimit = unit.limits.hitLimit
      this.budget = unit.limits.timeout
      this.config.hookTimeout = Math.min(hookTimeout, unit.limits.timeout)
    } else {
      let unit = plan!.units[index] as BatchUnit
      this.batch = unit
      for (let test of unit.tests) {
        this.planned.set(test.id, test)
      }
      runtime.hitLimit = unit.limits.load.hitLimit
      this.budget = unit.limits.total
      this.config.hookTimeout = Math.min(
        hookTimeout,
        unit.tests.reduce(
          (longest, test) => Math.max(longest, test.timeout),
          unit.limits.load.timeout,
        ),
      )
    }
    this.beat(this.budget, null)
    this.startTracking(false)
  }

  /**
   * Makes the collected tests run in file order, one at a time in a batch run
   * and in a dry run that tries each test twice, starts every attempt in an
   * outermost `aroundEach` hook, and selects the tests of a batch unit: every
   * test up to the last planned one. An isolated unit runs every test of the
   * file, concurrent tests concurrently. A dry run reads the hook timeouts of
   * every test and of the file's suite hooks first, for the watchdog.
   *
   * @param files - Collected test files.
   */
  public onCollected(files: RunnerTestFile[]): void {
    this.loadDuration = clock.now() - this.started
    let { options } = this
    for (let file of files) {
      if (options.mode === 'dry') {
        let { hookTimeout } = this.config
        for (let test of listTests(file)) {
          this.hookBudgets.set(test.id, getHookBudget(test, hookTimeout))
        }
        this.outsideBudget =
          options.timeouts!.file + getHookBudget(file, hookTimeout)
        this.beat(this.outsideBudget, null)
      }
      this.concurrent = orderTests(file, this.sequential) || this.concurrent
      installTryHook(file, (test, runTest) => this.aroundTry(test, runTest))
      if (file.result?.state === 'fail') {
        this.loadError ??= getErrorMessage(file.result.errors?.[0])
      }
    }
    if (this.batch === null || this.runnable !== null) {
      return
    }
    let tests = files.flatMap(file => listTests(file))
    let last = tests.findLastIndex(test => this.planned.has(test.id))
    this.runnable = new Set(tests.slice(0, last + 1).map(test => test.id))
  }

  /**
   * Prepares a test before its tries, after recording a test that ended with a
   * skip: a dry run tries it twice, or once without `repeat`; a batch run tries
   * each planned mutant not yet failed between two control tries, and runs an
   * unplanned test before the last planned one once without a mutant; tests
   * after the last planned one are skipped, and so is every test after a
   * timed-out try. Each try repeats the test as often as its own `repeats`
   * asks, so Vitest's repeats are multiplied; its `retry` is kept.
   *
   * @param test - Test or suite about to run.
   */
  public override async onBeforeRunTask(test: RunnerTask): Promise<void> {
    this.finishEnded()
    await super.onBeforeRunTask(test)
    if (test.mode !== 'run' || test.type !== 'test') {
      return
    }
    let { options } = this
    if (
      options.mode !== 'dry' &&
      (this.abandoned ||
        (this.runnable !== null && !this.runnable.has(test.id)))
    ) {
      test.mode = 'skip'
      return
    }
    let mutants =
      this.planned.get(test.id)?.mutants.filter(id => !this.killed.has(id)) ??
      []
    let plan =
      options.repeat ?
        [null, null]
      : [null, ...mutants.flatMap(id => [id, null])]
    let group = (test.repeats ?? 0) + 1
    test.repeats = plan.length * group - 1
    this.records.set(test, {
      current: null,
      tries: [],
      next: 0,
      group,
      plan,
      test,
    })
  }

  /**
   * Records an unhandled error of the process: in every try that runs now, as a
   * late error of the last try in a batch run, or else as an error outside
   * tries.
   *
   * @param error - Unhandled error or rejection reason.
   */
  public onStray(error: unknown): void {
    let message = getErrorMessage(error)
    let active = this.listActive()
    if (active.length > 0) {
      for (let current of active) {
        current.strays.push(message)
      }
    } else if (
      this.options.mode === 'batch' &&
      this.lastTest !== null &&
      this.out !== null
    ) {
      writeOutRecord(this.out, {
        mutant: this.lastMutant,
        test: this.lastTest,
        kind: 'late',
        message,
      })
    } else {
      this.loadStrays.push(message)
    }
  }

  /**
   * Records a test that ended with a skip before a suite ends. Once the file
   * suite ends, reads what the test file depended on so far, its snapshot files
   * included, before Vitest saves and drops its snapshot state; recording what
   * the code reads goes on until the unit ends, so the worker-scoped fixtures'
   * cleanup and the test environment's teardown count too.
   *
   * @param suite - Suite that ran.
   */
  public override async onAfterRunSuite(suite: RunnerTestSuite): Promise<void> {
    this.finishEnded()
    if (suite.file === suite && this.inputs !== null) {
      let client = Reflect.get(this, 'snapshotClient') as {
        snapshotStateMap: Map<string, Parameters<typeof listDependencies>[2]>
      }
      this.dependencies = this.listDependencies(
        client.snapshotStateMap.get(suite.file.filepath),
      )
    }
    await super.onAfterRunSuite(suite)
  }

  /**
   * Runs the planned test function, against mootant's timer when the try has a
   * deadline. After a timed-out try the rest of the test is skipped.
   *
   * @param test - Vitest task of the attempt.
   */
  public async runTask(test: RunnerTestCase): Promise<void> {
    let current = this.records.get(test)?.current ?? null
    if (current === null) {
      test.context.skip()
    }
    let run = TestRunner.getTestFn(test)
    let { deadline } = current
    if (deadline === null) {
      await run()
      return
    }
    current.timedOut = await raceTryTimeout(
      run,
      Math.max(0, deadline - clock.now()),
      clock,
    )
  }

  /**
   * Notes the first failed suite hook of a file that loaded once every test
   * file ran. The unit ends in the worker's teardown, after Vitest cleaned up
   * the worker-scoped fixtures and tore the test environment down, which
   * happens after this hook; without a teardown hook it ends here.
   *
   * @param files - Test files that ran.
   */
  public override onAfterRunFiles(files: RunnerTestFile[]): void {
    for (let record of this.records.values()) {
      this.finishTest(record)
    }
    if (this.loadError === null) {
      for (let file of files) {
        this.hookError ??= findHookError(file)
      }
    }
    this.filesEnded = true
    if (!this.endsInTeardown) {
      this.finishUnit()
    }
    super.onAfterRunFiles(files)
  }

  /**
   * Notes the state of the test after its `afterEach` hooks; the try's facts
   * are read once its teardown finished.
   *
   * @param test - Vitest task of the try.
   */
  public onAfterRetryTask(test: RunnerTestCase): void {
    let current = this.records.get(test)?.current
    if (current) {
      current.state = test.result!.state
    }
  }

  /**
   * Records a test that ended with a skip before a suite's hooks run.
   *
   * @param suite - Suite about to run.
   */
  public override async onBeforeRunSuite(
    suite: RunnerTestSuite,
  ): Promise<void> {
    this.finishEnded()
    await super.onBeforeRunSuite(suite)
  }

  /**
   * Records the try of a test that ended with its last repeat.
   *
   * @param test - Test that ended.
   */
  public override onAfterRunTask(test: RunnerTask): void {
    this.finishTest(this.records.get(test as RunnerTestCase)!)
    super.onAfterRunTask(test)
  }

  /**
   * Starts recording the project files the test code reads through `node:fs`
   * and the environment variables it reads, before the test file and its setup
   * files load. The first worker of a project in a dry run also writes the
   * hashes of the worker's environment variables, as Vitest set them up, to
   * `env/<hash>.json` of the work directory, for the main process to tell what
   * the variables read were.
   *
   * @param snapshot - Whether to write the environment of the project.
   */
  private startTracking(snapshot: boolean): void {
    let { directory, root } = this.options
    let inputs = {
      environment: new Set<string>(),
      written: new Set<string>(),
      touched: new Set<string>(),
      files: new Set<string>(),
    }
    this.inputs = inputs
    /**
     * Tells whether a path is a file of the project.
     *
     * @param file - Absolute path.
     * @returns Whether it is in the root, outside `node_modules`.
     */
    function isProjectFile(file: string): boolean {
      return (
        (file === root || file.startsWith(root + path.sep)) &&
        !file.includes(`${path.sep}node_modules${path.sep}`)
      )
    }
    trackFileReads({
      write: file => {
        inputs.written.add(file)
        inputs.touched.add(file)
        inputs.touched.add(path.dirname(file))
      },
      read: file => {
        if (isProjectFile(file) && !inputs.written.has(file)) {
          inputs.files.add(file)
        }
      },
    })
    let real = trackEnvironment(Reflect.get(this, 'workerState'), name => {
      inputs.environment.add(name)
    })
    if (snapshot) {
      let variables: Record<string, string> = {}
      for (let [name, value = ''] of Object.entries(real)) {
        variables[name] = createHash('sha256').update(value).digest('hex')
      }
      try {
        writeFileSync(
          path.join(
            directory,
            'env',
            `${getFileHash('', this.config.name ?? '')}.json`,
          ),
          JSON.stringify({ project: this.config.name ?? '', variables }),
          { flag: 'wx' },
        )
      } catch {}
    }
  }

  /**
   * Starts a try of a test after its previous try finished: in a batch run,
   * resets the counters and activates the try's mutant with the test's bounds;
   * in a dry run, collects the sites the try evaluates. After a timed-out try
   * no try starts, so the test skips itself.
   *
   * @param record - Test whose try begins.
   */
  private startTry(record: TestRecord): void {
    this.finishTry(record)
    if (this.abandoned) {
      return
    }
    let { runtime } = this
    let { mode } = this.options
    let { test } = record
    let index = record.next
    record.next += 1
    let started = clock.now()
    let current: CurrentTry = {
      attempt: test.result!.errors?.length ?? 0,
      covers: mode === 'dry' ? new Set() : null,
      retries: test.result!.retryCount ?? 0,
      outcome: undefined,
      hits: runtime.hits,
      state: undefined,
      timedOut: false,
      watch: started,
      repetitions: 0,
      deadline: null,
      errors: [],
      strays: [],
      started,
      test,
    }
    if (mode === 'batch') {
      this.outsideHits += runtime.hits
      runtime.hits = 0
      runtime.reached = false
      current.hits = 0
    } else if (mode === 'dry' && this.listActive().length === 0) {
      this.inside.from = runtime.hits
    }
    record.current = current
    if (mode === 'dry') {
      this.routeCoverage()
    } else if (mode === 'batch') {
      let entry = this.planned.get(test.id)
      runtime.active = record.plan[index]!
      runtime.hitLimit = entry?.hitLimit ?? Infinity
      if (entry !== undefined) {
        current.deadline = started + entry.timeout
        this.beat(entry.timeout, test)
      }
    } else {
      current.deadline = this.started + this.budget
    }
  }

  /**
   * Writes the end record of the unit once its test files ran and marks the
   * unit as finished for the progress of the main process, removes the
   * heartbeat file, and returns the runtime to its idle state.
   */
  private finishUnit(): void {
    let { runtime } = this
    let { mode } = this.options
    if (this.out !== null && this.filesEnded) {
      let { hits } = runtime
      if (mode === 'batch') {
        hits += this.outsideHits
      } else if (mode === 'dry') {
        hits -= this.inside.hits
      }
      let dependencies = this.stopTracking()
      writeOutRecord(this.out, {
        covers: [...this.loadCovers].toSorted(),
        duration: clock.now() - this.started,
        loadDuration: this.loadDuration,
        environment: this.environment,
        concurrent: this.concurrent,
        loadError: this.loadError,
        hookError: this.hookError,
        abandoned: this.abandoned,
        reached: runtime.reached,
        modified: this.modified,
        strays: this.loadStrays,
        unit: this.unitIndex,
        dependencies,
        kind: 'end',
        hits,
      })
      closeSync(
        openSync(path.join(this.options.directory, 'done', this.outName), 'w'),
      )
    }
    if (this.beatDescriptor !== null) {
      closeSync(this.beatDescriptor)
      this.beatDescriptor = null
    }
    rmSync(this.beatFile, { force: true })
    runtime.hitLimit = Infinity
    runtime.coverage = null
    runtime.active = null
  }

  /**
   * Reads the facts of a test's try that ended, once Vitest finished it, so
   * errors of its teardown count; then the runtime goes back to the state
   * between tries.
   *
   * @param record - Test whose try ended.
   */
  private finishTry(record: TestRecord): void {
    let { current } = record
    if (current === null) {
      return
    }
    record.current = null
    finishRepetition(current)
    let { runtime } = this
    let { mode } = this.options
    let { test } = current
    let facts = readTryFacts(test, runtime, {
      covers: current.covers === null ? null : [...current.covers].toSorted(),
      duration: clock.now() - current.started,
      hits: runtime.hits - current.hits,
      timedOut: current.timedOut,
      strays: current.strays,
      errors: current.errors,
      state: current.outcome,
    })
    record.tries.push(facts)
    this.lastTest = test.id
    this.lastMutant = runtime.active
    if (mode !== 'dry' && facts.timedOut) {
      this.abandoned = true
    }
    if (mode === 'batch') {
      if (runtime.active !== null && (facts.failed || facts.timedOut)) {
        this.killed.add(runtime.active)
      }
      runtime.active = null
      runtime.hitLimit = this.batch!.limits.load.hitLimit
      runtime.hits = 0
      runtime.reached = false
    } else if (mode === 'dry') {
      this.routeCoverage()
      if (this.activeCovers.length === 0) {
        this.inside.hits += runtime.hits - this.inside.from
      }
    }
  }

  /**
   * Runs one attempt from the outermost `aroundEach` hook. A retry continues
   * the repetition its failed attempt belonged to, and drops that attempt's
   * errors, as Vitest only counts the last attempt. Otherwise the attempt ends
   * a repetition, and a new try starts after the try's last repetition, or
   * after a try that timed out. A dry run beats with the attempt's budget: the
   * dry test budget plus the test's own timeout and its hooks' timeouts. Then
   * the inner hooks and the test run, and the attempt waits for the next turn
   * of the event loop, so an unhandled rejection of the attempt lands in its
   * try. A try's facts are read when the next try starts or the test ends.
   *
   * @param test - Test whose attempt begins.
   * @param runTest - Runs the inner hooks and the test.
   */
  private async aroundTry(
    test: RunnerTestCase,
    runTest: () => Promise<void>,
  ): Promise<void> {
    let record = this.records.get(test)!
    let { current } = record
    let retries = test.result!.retryCount ?? 0
    if (current === null || current.timedOut) {
      this.startTry(record)
    } else if (retries > current.retries) {
      // Vitest retries only after an attempt that added an error.
      current.attempt = test.result!.errors!.length
      current.state = undefined
      current.retries = retries
    } else if (current.repetitions + 1 === record.group) {
      this.startTry(record)
    } else {
      finishRepetition(current)
    }
    if (this.options.mode === 'dry') {
      let timeout = test.timeout > 0 ? test.timeout : Infinity
      let now = clock.now()
      record.current!.watch =
        now +
        this.options.timeouts!.test +
        timeout +
        this.hookBudgets.get(test.id)!
      this.beatDry(now)
    }
    await runTest()
    await new Promise<void>(resolve => {
      clock.setImmediate(resolve)
    })
  }

  /**
   * Stops recording what the code reads once the unit ended and lists what it
   * depended on: what the test file depended on when its file suite ended, with
   * what the worker evaluated, required and read through `node:fs` until now,
   * the environment variables it read, and the files it read and changed
   * itself. A test environment other than Vitest's own loads and sets up before
   * the runner exists, so what its module and `setup` read, and the references
   * to `process.env` and `node:fs` they keep, are out of sight: such a unit
   * reports no dependencies, so it is never cached.
   *
   * @returns What the unit depended on, sorted, or null when it cannot tell.
   */
  private stopTracking(): string[] | null {
    let { environment, touched, files } = this.inputs!
    let dependencies = new Set([
      ...(this.dependencies ?? []),
      ...this.listDependencies(undefined),
    ])
    this.environment = [...environment].toSorted()
    this.modified = [...files].filter(file => touched.has(file)).toSorted()
    this.inputs = null
    let state = Reflect.get(this, 'workerState') as {
      ctx: { environment: { name: string } }
      metaEnv: object
    }
    trackFileReads(null)
    trackEnvironment(state, null)
    this.dependencies = [...dependencies].toSorted()
    return Object.hasOwn(builtinEnvironments, state.ctx.environment.name) ?
        this.dependencies
      : null
  }

  /**
   * Writes a heartbeat: the main process stops the worker when no newer beat
   * comes within the budget and the grace period. The heartbeat file stays
   * open, so a beat costs one write.
   *
   * @param budget - Milliseconds the work from now may take, or `Infinity`.
   * @param test - Running test, or null outside tests.
   */
  private beat(budget: number, test: RunnerTestCase | null): void {
    this.sequence += 1
    this.beatDescriptor ??= openSync(this.beatFile, 'w')
    this.beatLength = writeHeartbeat(
      this.beatDescriptor,
      {
        budget: Math.min(Math.max(0, budget), MAX_BUDGET) + HANG_GRACE,
        name: test?.fullTestName ?? null,
        mutant: this.runtime.active,
        sequence: this.sequence,
        test: test?.id ?? null,
        unit: this.unitIndex,
        pid: process.pid,
        file: this.file,
      },
      this.beatLength,
    )
  }

  /**
   * Finishes the last try of a test and writes the test's tries to the out
   * file, then beats with the time left.
   *
   * @param record - Test that ended.
   */
  private finishTest(record: TestRecord): void {
    this.finishTry(record)
    let { test } = record
    this.records.delete(test)
    writeOutRecord(this.out!, {
      line: test.location?.line ?? null,
      name: test.fullTestName,
      tries: record.tries,
      kind: 'test',
    })
    delete test.result!.errors
    if (this.options.mode === 'dry') {
      this.beatDry()
    } else {
      this.beat(this.budget - (clock.now() - this.started), null)
    }
  }

  /**
   * Points the runtime's coverage at the tries of a dry run that run now: the
   * set of the only one, every one of them through `coverSink`, or the file's
   * set outside tries.
   */
  private routeCoverage(): void {
    let { runtime } = this
    this.activeCovers = this.listActive().map(current => current.covers!)
    let [only] = this.activeCovers
    if (only === undefined) {
      runtime.coverage = this.loadCovers
    } else if (this.activeCovers.length === 1) {
      runtime.coverage = only
    } else {
      runtime.coverage = this.coverSink
    }
  }

  /**
   * Beats in a dry run with the latest end any running attempt may reach,
   * naming its test, or with the budget of the work outside tries when no try
   * runs.
   *
   * @param now - Time on the captured clock.
   */
  private beatDry(now = clock.now()): void {
    let latest: CurrentTry | null = null
    for (let current of this.listActive()) {
      if (latest === null || current.watch > latest.watch) {
        latest = current
      }
    }
    if (latest === null) {
      this.beat(this.outsideBudget, null)
    } else {
      this.beat(latest.watch - now, latest.test)
    }
  }

  /**
   * Lists what the test file depended on so far (`listDependencies`), the files
   * it read through `node:fs` included.
   *
   * @param snapshot - Snapshot state of the test file, or undefined.
   * @returns Module ids and absolute paths, sorted.
   */
  private listDependencies(
    snapshot: Parameters<typeof listDependencies>[2],
  ): string[] {
    return listDependencies(
      Reflect.get(this, 'workerState'),
      [
        ...Object.keys(createRequire(import.meta.url).cache),
        ...this.inputs!.files,
      ],
      snapshot,
    )
  }

  /**
   * Runs Vitest's cleanup of the worker-scoped fixtures with the unit's mutant
   * still active. The unit ends when the worker's teardown finished, after the
   * test environment's teardown, or right after the cleanup when the teardown
   * cannot be watched. An error of the cleanup is the unit's hook error unless
   * a suite hook failed first, and is thrown on, so Vitest reports it as it
   * does in a plain run.
   *
   * @param cleanup - Vitest's cleanup of the worker-scoped fixtures.
   * @returns Resolves when the cleanup finished.
   */
  private async tearDown(cleanup: () => unknown): Promise<void> {
    try {
      await cleanup()
    } catch (error) {
      this.hookError ??= getErrorMessage(error)
      throw error
    } finally {
      if (!this.endsOnClose) {
        this.finishUnit()
      }
    }
  }

  /**
   * Lists the tries that run now or wait for their teardown.
   *
   * @returns Tries of the started tests.
   */
  private listActive(): CurrentTry[] {
    let active: CurrentTry[] = []
    for (let { current } of this.records.values()) {
      if (current !== null) {
        active.push(current)
      }
    }
    return active
  }

  /**
   * Records the tests that ended: every started test when tests run one at a
   * time, else those that ended with a skip, which Vitest ends without
   * `onAfterRunTask`.
   */
  private finishEnded(): void {
    for (let record of this.records.values()) {
      if (this.sequential || record.test.mode === 'skip') {
        this.finishTest(record)
      }
    }
  }
}

/**
 * Sends the unhandled errors of the process to the given runner. The process
 * listeners are added once per process, so a second runner in the same process
 * only takes them over.
 *
 * @param runner - Runner of the file that runs now.
 */
function listenForStrays(runner: MootantRunner): void {
  let slot = Reflect.get(globalThis, STRAY_SLOT) as StraySlot | undefined
  if (slot === undefined) {
    let created: StraySlot = { current: runner }
    /**
     * Passes an unhandled error to the current runner.
     *
     * @param error - Unhandled error or rejection reason.
     */
    function forward(error: unknown): void {
      created.current.onStray(error)
    }
    process.on('unhandledRejection', forward)
    process.on('uncaughtException', forward)
    Reflect.set(globalThis, STRAY_SLOT, created)
    slot = created
  }
  slot.current = runner
}

/**
 * Ends the repetition of the try whose last attempt finished: keeps the
 * attempt's errors and a failed or skipped state, then the next attempt starts
 * a new repetition.
 *
 * @param current - Try that runs now.
 */
function finishRepetition(current: CurrentTry): void {
  let errors = current.test.result!.errors ?? []
  current.errors.push(...errors.slice(current.attempt))
  if (current.state === 'fail' || current.state === 'skip') {
    current.outcome = current.state
  }
  current.repetitions += 1
  current.attempt = errors.length
  current.state = undefined
}
