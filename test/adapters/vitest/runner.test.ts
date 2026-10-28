import type {
  SerializedConfig,
  RunnerTestSuite,
  RunnerTestCase,
  RunnerTestFile,
  RunnerTask,
} from 'vitest'

import {
  beforeEach,
  afterEach,
  afterAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import { readFile, readdir, mkdtemp, mkdir, rm } from 'node:fs/promises'
import { writeFileSync, readFileSync, existsSync } from 'node:fs'
import { TestRunner } from 'vitest'
import { tmpdir } from 'node:os'
import path from 'node:path'

import type {
  VitestWorkerOptions,
  VitestOutRecord,
  VitestHeartbeat,
} from '../../../adapters/vitest/types/vitest-worker'
import type { BatchUnit, BatchTest } from '../../../types/adapter/batch-plan'
import type { MutantRuntime } from '../../../types/adapter/mutant-runtime'
import type { IsolatedUnit } from '../../../types/adapter/isolated-plan'

import { getFileHash } from '../../../adapters/vitest/worker/get-file-hash'
import MootantRunner from '../../../adapters/vitest/runner'

/**
 * Tracing helper of a Vitest worker, which runs every step of the worker.
 */
interface FakeTraces {
  /**
   * Runs a step of the worker.
   */
  $(name: string, run: () => unknown): unknown
}

/**
 * `aroundEach` hook as Vitest calls it.
 */
type AroundHook = (
  runTest: () => Promise<void>,
  context: { task: RunnerTestCase },
) => Promise<void>

/**
 * Hook lists of a fake file or suite.
 */
type FakeHooks = { aroundEach: AroundHook[] } & Record<string, unknown[]>

/**
 * Behavior of a fake test function in one try.
 */
type Body = (runtime: MutantRuntime) => Promise<void> | void

/**
 * Root of the fake project.
 */
const ROOT = '/project'

/**
 * Test file of the fake runs.
 */
const FILE = '/project/test/a.test.ts'

/**
 * Watchdog budgets of the dry runs of the tests.
 */
const TIMEOUTS = { file: 100, test: 50 }

/**
 * Bounds of loading the fake test file and of its whole batch unit.
 */
const BATCH_LIMITS: BatchUnit['limits'] = {
  load: { hitLimit: 50, timeout: 300 },
  total: 5000,
}

/**
 * Isolated unit of the fake test file with the mutant `m`.
 */
const ISOLATED_UNIT: IsolatedUnit = {
  limits: { hitLimit: 100, timeout: 4000 },
  project: '',
  mutant: 'm',
  file: FILE,
}

let listeners = {
  unhandledRejection: process.listeners('unhandledRejection'),
  uncaughtException: process.listeners('uncaughtException'),
}

let bodies = new WeakMap<RunnerTask, Body>()
let hooks = new WeakMap<object, FakeHooks>()
let cleanups: (() => unknown)[] = []
let workerState = Reflect.get(globalThis, '__vitest_worker__') as {
  ctx: { environment: { name: string }; traces?: unknown; pool: string }
}
let realTraces = workerState.ctx.traces
let traces: FakeTraces | undefined
let directory: string
let options: VitestWorkerOptions

/**
 * Runs a test the way Vitest 5 does: every attempt of every repeat inside the
 * `aroundEach` hooks, a retry after a failed attempt while retries are left
 * (counted across repeats in `retryCount`), a skip that ends the test without
 * `onAfterRunTask`, and the flip of a test expected to fail after each
 * attempt.
 *
 * @param runner - Runner under test.
 * @param file - Collected file whose hooks wrap each attempt.
 * @param task - Fake test; the runner sets its repeats.
 */
async function simulateTest(
  runner: MootantRunner,
  file: RunnerTestFile,
  task: RunnerTestCase,
): Promise<void> {
  await runner.onBeforeRunTask(task)
  if (task.mode !== 'run') {
    return
  }
  task.result = { state: 'run' }
  let around = getHooks(file)?.aroundEach ?? []
  let outcome = { failedRepeat: false }
  let retries = Array.from({ length: (task.retry as number) + 1 }, () => 0)
  let repeats = Array.from({ length: (task.repeats ?? 0) + 1 }, () => around)
  let skipped = await repeats.reduce(async (previous, fileHooks) => {
    if (await previous) {
      return true
    }
    let result = task.result!
    result.state = 'run'
    let last = await retries.reduce<Promise<string>>(
      async (attempted, _zero, attempt) => {
        let state = await attempted
        if (state !== 'fail') {
          return state
        }
        if (attempt > 0) {
          result.state = 'run'
          result.retryCount = (result.retryCount ?? 0) + 1
        }
        let skip = await simulateRepeat(runner, fileHooks, task)
        return skip ? 'skip' : result.state
      },
      Promise.resolve('fail'),
    )
    outcome.failedRepeat ||= last === 'fail'
    return last === 'skip'
  }, Promise.resolve(false))
  if (skipped) {
    return
  }
  if (outcome.failedRepeat) {
    task.result.state = 'fail'
  }
  runner.onAfterRunTask(task)
}

/**
 * Runs one attempt of a test inside its `aroundEach` hooks, then skips or flips
 * the result as Vitest does.
 *
 * @param runner - Runner under test.
 * @param around - `aroundEach` hooks of the file, outermost first.
 * @param test - Test that repeats.
 * @returns Whether the attempt skipped the test, which ends it.
 */
async function simulateRepeat(
  runner: MootantRunner,
  around: AroundHook[],
  test: RunnerTestCase,
): Promise<boolean> {
  let result = test.result!
  let start = result.errors?.length ?? 0
  try {
    await callAround(around, test, async () => {
      try {
        await runner.runTask(test)
        if (result.state !== 'fail') {
          result.state = 'pass'
        }
      } catch (error) {
        failTry(test, error)
      }
      runner.onAfterRetryTask(test)
    })
  } catch (error) {
    failTry(test, error)
  }
  let state = result.state as string
  if (state === 'skip') {
    test.mode = 'skip'
    test.result = { state: 'skip' }
    return true
  }
  if (test.fails === true) {
    if (state === 'pass') {
      result.state = 'fail'
      result.errors ??= []
      result.errors.push({ message: 'Expect test to fail' })
    } else {
      result.state = 'pass'
      result.errors?.splice(start)
    }
  }
  return false
}

/**
 * Creates a runner for the current options.
 *
 * @param hookTimeout - User hook timeout.
 * @param name - Name of the project, if any.
 * @returns Runner and its serialized configuration.
 */
function createRunner(
  hookTimeout = 10_000,
  name?: string,
): {
  config: SerializedConfig
  runner: MootantRunner
} {
  let config: SerializedConfig = {
    experimental: { viteModuleRunner: true },
    hookTimeout,
    name,
  } as never
  let runner = new MootantRunner(config)
  let state = Reflect.get(runner, 'workerState') as {
    onCleanup(listener: () => unknown): void
  }
  vi.spyOn(state, 'onCleanup').mockImplementation(listener => {
    cleanups.push(listener)
  })
  return { runner, config }
}

/**
 * Runs the tasks of a suite in order, suites with their hooks; a suite the
 * runner skipped before it started runs nothing, as in Vitest.
 *
 * @param runner - Runner under test.
 * @param file - Test file of the tasks.
 * @param tasks - Tests and suites to run.
 */
async function runTasks(
  runner: MootantRunner,
  file: RunnerTestFile,
  tasks: RunnerTask[],
): Promise<void> {
  await tasks.reduce(async (previous, task) => {
    await previous
    if (task.type === 'suite') {
      await runner.onBeforeRunSuite(task)
      if (task.mode === 'skip') {
        return
      }
      await runTasks(runner, file, task.tasks)
      await runner.onAfterRunSuite(task)
    } else {
      await simulateTest(runner, file, task)
    }
  }, Promise.resolve())
}

/**
 * Reads the out files of the run.
 *
 * @returns Records by out file name.
 */
async function readRecords(): Promise<Record<string, VitestOutRecord[]>> {
  let names = await readdir(path.join(directory, 'out'))
  let texts = await Promise.all(
    names.map(name => readFile(path.join(directory, 'out', name), 'utf8')),
  )
  return Object.fromEntries(
    names.map((name, index) => [
      name.replace(/\.jsonl$/u, ''),
      texts[index]!.trim()
        .split('\n')
        .map(line => JSON.parse(line) as VitestOutRecord),
    ]),
  )
}

/**
 * Creates a fake test file.
 *
 * @param tasks - Fake tests and suites in file order.
 * @returns Collected file.
 */
function createFile(tasks: RunnerTask[]): RunnerTestFile {
  let file = { filepath: FILE, type: 'suite', tasks } as RunnerTestFile
  /**
   * Links tasks and their nested tasks to the file.
   *
   * @param list - Tasks of the file or of a suite.
   */
  function link(list: RunnerTask[]): void {
    for (let task of list) {
      task.file = file
      if (task.type === 'suite') {
        link(task.tasks)
      }
    }
  }
  link(tasks)
  return file
}

/**
 * Creates a fake test.
 *
 * @param id - Id and name of the test.
 * @param body - What the test does in each try.
 * @returns Test in run mode.
 */
function createTest(id: string, body: Body = () => {}): RunnerTestCase {
  let test: RunnerTestCase = {
    context: {
      skip: () => {
        throw Object.assign(new Error('skipped'), { skip: true })
      },
    },
    location: { column: 1, line: 3 },
    fullTestName: `suite > ${id}`,
    timeout: 1000,
    type: 'test',
    mode: 'run',
    name: id,
    retry: 0,
    id,
  } as never
  bodies.set(test, body)
  return test
}

/**
 * Tears the worker down as Vitest 5 does when it stops a worker, in one traced
 * step: runs the cleanup listeners the runners registered, then the teardown of
 * the test environment. An error of the cleanup is returned, an error of the
 * environment's teardown is thrown.
 *
 * @param environment - Teardown of the test environment.
 * @returns Error of the cleanup listeners, or null.
 */
async function tearDownWorker(
  environment: () => unknown = () => {},
): Promise<unknown> {
  let registered = cleanups.splice(0)
  return await traces!.$('vitest.runtime.teardown', async () => {
    let failure: unknown = null
    try {
      await Promise.all(registered.map(listener => listener()))
    } catch (error) {
      failure = error
    }
    await environment()
    return failure
  })
}

/**
 * Gets the suite hooks of a fake file, as `TestRunner.getSuiteHooks` does: a
 * file that failed to collect has none.
 *
 * @param file - Fake test file.
 * @returns Its hooks, or undefined.
 */
function getHooks(
  file: RunnerTestSuite | RunnerTestFile,
): FakeHooks | undefined {
  if (file.result?.state === 'fail') {
    return undefined
  }
  let found = hooks.get(file) ?? {
    aroundEach: [],
    beforeEach: [],
    afterEach: [],
    beforeAll: [],
    aroundAll: [],
    afterAll: [],
  }
  hooks.set(file, found)
  return found
}

/**
 * Collects and runs a fake file with the runner as Vitest 5's `startTests`
 * does, but without handing the cleanup of the worker-scoped fixtures to the
 * runner and without the worker's teardown: a file that failed to collect runs
 * no tests.
 *
 * @param runner - Runner under test.
 * @param file - Collected file.
 * @param load - What loading the file does.
 */
async function collectAndRun(
  runner: MootantRunner,
  file: RunnerTestFile,
  load: () => void = () => {},
): Promise<void> {
  await runner.onBeforeCollect([FILE])
  load()
  runner.onCollected([file])
  if (file.result?.state !== 'fail') {
    await runTasks(runner, file, file.tasks)
  }
  runner.onAfterRunFiles([file])
}

/**
 * Records a thrown value on a test result as Vitest does.
 *
 * @param test - Test whose try threw.
 * @param error - Thrown value.
 */
function failTry(test: RunnerTestCase, error: unknown): void {
  if ((error as { skip?: boolean }).skip === true) {
    test.result!.state = 'skip'
    return
  }
  test.result!.state = 'fail'
  test.result!.errors ??= []
  test.result!.errors.push({ message: (error as Error).message })
}

/**
 * Calls the `aroundEach` hooks of a try from the outermost one in, with the try
 * in the middle.
 *
 * @param around - Hooks left to call, outermost first.
 * @param test - Test of the try.
 * @param inner - The try between the hooks.
 */
async function callAround(
  around: AroundHook[],
  test: RunnerTestCase,
  inner: () => Promise<void>,
): Promise<void> {
  let [hook, ...rest] = around
  if (hook === undefined) {
    await inner()
    return
  }
  await hook(() => callAround(rest, test, inner), { task: test })
}

/**
 * Lists the tries of the test records as test, mutant, failed and reached.
 *
 * @param records - Records of one out file.
 * @returns Tries per test record, and the kinds of other records.
 */
function summarize(records: VitestOutRecord[]): unknown[] {
  return records.map(record =>
    record.kind === 'test' ?
      record.tries.map(facts => [
        facts.test,
        facts.mutant,
        facts.failed,
        facts.reached,
      ])
    : record.kind,
  )
}

/**
 * Writes the plan of the fake test file.
 *
 * @param units - Units of the file.
 * @param project - Name of the project of the file.
 */
function writePlan(units: (IsolatedUnit | BatchUnit)[], project = ''): void {
  writeFileSync(
    path.join(directory, 'plan', `${getFileHash(FILE, project)}.json`),
    JSON.stringify({ indexes: units.map((_unit, index) => index + 5), units }),
  )
}

/**
 * Creates a fake suite.
 *
 * @param tasks - Fake tests of the suite.
 * @param errors - Errors of the suite's own hooks.
 * @returns Collected suite.
 */
function createSuite(
  tasks: RunnerTask[],
  errors?: { message: string }[],
): RunnerTestSuite {
  return {
    result: errors === undefined ? undefined : { state: 'fail', errors },
    type: 'suite',
    mode: 'run',
    tasks,
  } as never
}

/**
 * Runs a whole fake file with the runner as Vitest 5 does: the cleanup of the
 * worker-scoped fixtures is handed to the runner first, and runs in the
 * worker's teardown, after the file.
 *
 * @param runner - Runner under test.
 * @param file - Collected file.
 * @param load - What loading the file does.
 */
async function runFile(
  runner: MootantRunner,
  file: RunnerTestFile,
  load: () => void = () => {},
): Promise<void> {
  runner.onCleanupWorkerContext!(() => {})
  await collectAndRun(runner, file, load)
  await tearDownWorker()
}

/**
 * Creates a runner for the current options in a `vmForks` pool, where Vitest
 * hands the runner no cleanup of the worker-scoped fixtures.
 *
 * @returns Runner without `onCleanupWorkerContext`.
 */
function createVmRunner(): MootantRunner {
  let { pool } = workerState.ctx
  workerState.ctx.pool = 'vmForks'
  try {
    return createRunner().runner
  } finally {
    workerState.ctx.pool = pool
  }
}

/**
 * Sets the worker options the next runner reads: a dry run gets the watchdog
 * budgets of the tests, batch and isolated runs get none.
 *
 * @param mode - Kind of the run.
 * @param repeat - Whether a dry run tries every test twice in a row; false when
 *   omitted.
 */
function setOptions(mode: VitestWorkerOptions['mode'], repeat = false): void {
  options = {
    timeouts: mode === 'dry' ? TIMEOUTS : null,
    root: ROOT,
    directory,
    repeat,
    mode,
  }
}

/**
 * Reads the heartbeat file of this process.
 *
 * @returns Last beat.
 */
function readBeat(): VitestHeartbeat {
  return JSON.parse(
    readFileSync(path.join(directory, 'beat', `${process.pid}.json`), 'utf8'),
  ) as VitestHeartbeat
}

/**
 * Writes the plan of the fake test file with one batch unit.
 *
 * @param tests - Planned tests of the unit in file order.
 * @param project - Name of the project of the file.
 */
function writeBatchPlan(tests: BatchTest[], project = ''): void {
  writePlan([{ limits: BATCH_LIMITS, file: FILE, project, tests }], project)
}

/**
 * Tells whether the heartbeat file of this process exists.
 *
 * @returns Whether the file is there.
 */
function hasBeat(): boolean {
  return existsSync(path.join(directory, 'beat', `${process.pid}.json`))
}

/**
 * Gets the runtime the runner installed.
 *
 * @returns Mutant runtime of the process.
 */
function getRuntime(): MutantRuntime {
  return Reflect.get(globalThis, '__mootant') as MutantRuntime
}

describe('mootantRunner', () => {
  let hash = getFileHash(FILE, '')

  beforeEach(async () => {
    traces = { $: (_name, run) => run() }
    workerState.ctx.traces = traces
    directory = await mkdtemp(path.join(tmpdir(), 'mootant-runner-'))
    await Promise.all(
      ['beat', 'claim', 'done', 'env', 'out', 'plan', 'worker'].map(folder =>
        mkdir(path.join(directory, folder)),
      ),
    )
    vi.spyOn(TestRunner.prototype, 'injectValue').mockImplementation(
      () => options,
    )
    vi.spyOn(TestRunner.prototype, 'onBeforeRunTask').mockResolvedValue()
    vi.spyOn(TestRunner.prototype, 'onBeforeRunSuite').mockResolvedValue()
    vi.spyOn(TestRunner.prototype, 'onAfterRunSuite').mockResolvedValue()
    vi.spyOn(TestRunner.prototype, 'onAfterRunTask').mockReturnValue()
    vi.spyOn(TestRunner.prototype, 'onAfterRunFiles').mockReturnValue()
    vi.spyOn(TestRunner, 'getSuiteHooks').mockImplementation(
      suite => getHooks(suite) as never,
    )
    vi.spyOn(TestRunner, 'getTestFn').mockImplementation(
      task => () => bodies.get(task as RunnerTask)!(getRuntime()),
    )
  })

  afterEach(async () => {
    cleanups = []
    workerState.ctx.traces = realTraces
    vi.restoreAllMocks()
    await rm(directory, { recursive: true, force: true })
  })

  afterAll(() => {
    for (let listener of process.listeners('unhandledRejection')) {
      if (!listeners.unhandledRejection.includes(listener)) {
        process.off('unhandledRejection', listener)
      }
    }
    for (let listener of process.listeners('uncaughtException')) {
      if (!listeners.uncaughtException.includes(listener)) {
        process.off('uncaughtException', listener)
      }
    }
    Reflect.deleteProperty(globalThis, '__mootant')
    Reflect.deleteProperty(globalThis, Symbol.for('mootant.vitest.strays'))
  })

  it('records coverage, stray errors and flips in a dry run with beats', async () => {
    setOptions('dry', true)
    let { runner } = createRunner()
    let first = true
    let beats: VitestHeartbeat[] = []
    let tests = [
      createTest('a', runtime => {
        beats.push(readBeat())
        runtime.hit('x')
        if (first) {
          runtime.hit('y')
          first = false
        }
      }),
      createTest('b', () => {
        runner.onStray(new Error('during'))
        throw new Error('fails\nstack')
      }),
      createTest('c', () => {}),
      Object.assign(
        createTest('d', () => {
          throw new Error('expected')
        }),
        { fails: true },
      ),
      Object.assign(createTest('e'), { fails: true }),
    ]
    tests[2]!.mode = 'skip'
    delete tests[4]!.location
    let file = createFile(tests)
    file.result = { errors: [{ message: 'hook' }], state: 'pass' } as never
    await runFile(runner, file, () => {
      beats.push(readBeat())
      getRuntime().hit('load')
      runner.onStray(new Error('outside'))
    })

    let records = await readRecords()

    expect(beats.map(beat => [beat.budget, beat.test, beat.name])).toEqual([
      [1100, null, null],
      [2050, 'a', 'suite > a'],
      [2050, 'a', 'suite > a'],
    ])
    expect(Object.keys(records)).toStrictEqual([`${hash}-${process.pid}`])
    await expect(readdir(path.join(directory, 'done'))).resolves.toStrictEqual([
      `${hash}-${process.pid}`,
    ])
    expect(records[`${hash}-${process.pid}`]).toMatchObject([
      {
        tries: [
          { covers: ['x', 'y'], failed: false, mutant: null, hits: 2 },
          { covers: ['x'], failed: false, hits: 1 },
        ],
        name: 'suite > a',
        kind: 'test',
        line: 3,
      },
      {
        tries: [
          { strays: ['during'], message: 'fails', failed: true },
          { strays: ['during'], failed: true },
        ],
        kind: 'test',
      },
      { tries: [{ failed: false }, { failed: false }], kind: 'test' },
      {
        tries: [
          { message: 'Expect test to fail', failed: true },
          { failed: true },
        ],
        kind: 'test',
        line: null,
      },
      {
        strays: ['outside'],
        hookError: 'hook',
        abandoned: false,
        covers: ['load'],
        loadError: null,
        kind: 'end',
        hits: 1,
        unit: 0,
      },
    ])
    expect(tests[0]!.repeats).toBe(1)
    expect(tests[0]!.result!.errors).toBeUndefined()
    expect(getRuntime().coverage).toBeNull()
  })

  it('records what the unit depended on in a dry run, its teardown included', async () => {
    setOptions('dry')
    let project = path.join(directory, 'project')
    await mkdir(path.join(project, 'node_modules'), { recursive: true })
    options.root = project
    let { runner } = createRunner()
    let snapshot = '/project/test/__snapshots__/a.test.ts.snap'
    Reflect.set(runner, 'snapshotClient', {
      snapshotStateMap: new Map([
        [
          FILE,
          {
            getSnapshotFiles: () => ['/project/test/output.txt'],
            snapshotPath: snapshot,
          },
        ],
      ]),
    })
    let data = path.join(project, 'data.json')
    let written = path.join(project, 'written.json')
    let fixture = path.join(project, 'fixture.json')
    let setting = path.join(project, 'environment.json')
    let changed = path.join(project, 'changed.json')
    let file = createFile([
      createTest('a', () => {
        expect(process.env['MOOTANT_PROBE']).toBeUndefined()
        expect(existsSync(data)).toBe(false)
        expect(existsSync(path.join(project, 'node_modules/a.json'))).toBe(
          false,
        )
        expect(existsSync(path.join(tmpdir(), 'outside.json'))).toBe(false)
        expect(existsSync(changed)).toBe(false)
        writeFileSync(changed, '{}')
        writeFileSync(written, '{}')
        expect(readFileSync(written, 'utf8')).toBe('{}')
      }),
    ])
    file.file = file
    runner.onCleanupWorkerContext!(() => {
      expect(existsSync(fixture)).toBe(false)
      expect(process.env['MOOTANT_FIXTURE']).toBeUndefined()
    })
    await runner.onBeforeCollect([FILE])
    runner.onCollected([file])
    await runTasks(runner, file, file.tasks)
    await runner.onAfterRunSuite(file)
    expect(process.env['MOOTANT_LATE']).toBeUndefined()
    runner.onAfterRunFiles([file])
    await tearDownWorker(() => {
      expect(existsSync(setting)).toBe(false)
      expect(process.env['MOOTANT_ENVIRONMENT']).toBeUndefined()
    })
    expect(existsSync(path.join(project, 'after.json'))).toBe(false)
    expect(process.env['MOOTANT_AFTER']).toBeUndefined()

    let [records] = Object.values(await readRecords())
    let end = records!.at(-1) as {
      dependencies: string[]
      environment: string[]
      modified: string[]
    }
    let [saved] = await readdir(path.join(directory, 'env'))
    let environment = JSON.parse(
      await readFile(path.join(directory, 'env', saved!), 'utf8'),
    ) as { variables: Record<string, string>; project: string }

    expect(end.dependencies).toContain(snapshot)
    expect(end.dependencies).toContain('/project/test/output.txt')
    expect(end.dependencies).toContain(import.meta.filename)
    expect(end.dependencies).toContain(data)
    expect(end.dependencies).not.toContain(written)
    expect(
      end.dependencies.filter(dependency => dependency.startsWith(project)),
    ).toStrictEqual([changed, data, setting, fixture])
    expect(end.environment).toStrictEqual([
      'MOOTANT_ENVIRONMENT',
      'MOOTANT_FIXTURE',
      'MOOTANT_LATE',
      'MOOTANT_PROBE',
    ])
    expect(end.modified).toStrictEqual([changed])
    expect(saved).toBe(`${getFileHash('', '')}.json`)
    expect(environment.project).toBe('')
    expect(environment.variables['PATH']).toMatch(/^[\da-f]{64}$/u)
  })

  it('surrounds every planned mutant with control tries in a batch run', async () => {
    setOptions('batch')
    writeBatchPlan([
      { mutants: ['m1', 'm2'], timeout: 1000, hitLimit: 10, id: 'b' },
      { mutants: ['m1', 'm3'], timeout: 1000, hitLimit: 10, id: 'c' },
      { mutants: ['m1'], timeout: 1000, hitLimit: 10, id: 'd' },
    ])
    let { runner, config } = createRunner()
    let body: Body = runtime => {
      if (runtime.hit('m1')) {
        throw new Error('killed')
      }
      runtime.hit('m2')
    }
    let tests = [
      createTest('a', runtime => {
        runtime.hit('m1')
      }),
      createTest('b', body),
      createTest('c', body),
      createTest('d', body),
      createTest('e', body),
    ]
    let file = createFile(tests)
    await runFile(runner, file, () => {
      expect(getRuntime().hitLimit).toBe(BATCH_LIMITS.load.hitLimit)
      getRuntime().hit('m3')
    })
    let records = (await readRecords())[`${hash}-0`]!

    expect(config.hookTimeout).toBe(1000)
    expect(summarize(records)).toStrictEqual([
      [['a', null, false, false]],
      [
        ['b', null, false, false],
        ['b', 'm1', true, true],
        ['b', null, false, false],
        ['b', 'm2', false, true],
        ['b', null, false, false],
      ],
      [
        ['c', null, false, false],
        ['c', 'm3', false, false],
        ['c', null, false, false],
      ],
      [['d', null, false, false]],
      'end',
    ])
    expect(records.at(-1)).toMatchObject({ kind: 'end', unit: 5, hits: 1 })
    expect(records.at(-1)).toMatchObject({ environment: [] })
    expect(records.at(-1)).toHaveProperty('dependencies')
    expect(tests[4]!.mode).toBe('skip')
    expect(hasBeat()).toBe(false)
  })

  it('reads a try after its aroundEach teardown, with its mutant active', async () => {
    setOptions('batch')
    writeBatchPlan([
      { mutants: ['m1', 'm2'], timeout: 1000, hitLimit: 10, id: 'a' },
    ])
    let { runner } = createRunner()
    let result = 0
    let tests = [
      createTest('a', runtime => {
        result = runtime.hit('m1') ? 1 : 2
      }),
    ]
    let file = createFile(tests)
    let teardown: (string | null)[] = []
    await runner.onBeforeCollect([FILE])
    runner.onCollected([file])
    getHooks(file)!.aroundEach.push(async runTest => {
      await runTest()
      teardown.push(getRuntime().active)
      if (result !== 2) {
        throw new Error('teardown boom')
      }
    })
    await runTasks(runner, file, tests)
    runner.onAfterRunFiles([file])
    let records = (await readRecords())[`${hash}-0`]!

    expect(teardown).toStrictEqual([null, 'm1', null, 'm2', null])
    expect(records[0]).toMatchObject({
      tries: [
        { failed: false, mutant: null },
        { message: 'teardown boom', reached: true, failed: true, mutant: 'm1' },
        { failed: false, mutant: null },
        { failed: false, mutant: 'm2' },
        { failed: false, mutant: null },
      ],
    })
  })

  it('writes late errors and abandons a unit after a timeout', async () => {
    setOptions('batch')
    writeBatchPlan([
      { mutants: ['m1', 'm2'], hitLimit: 10, timeout: 20, id: 'a' },
      { mutants: ['m2'], hitLimit: 10, timeout: 20, id: 'b' },
    ])
    let { runner, config } = createRunner(0)
    let tests = [
      createTest('a', runtime =>
        runtime.hit('m2') ? new Promise<void>(() => {}) : Promise.resolve(),
      ),
      createTest('b'),
    ]
    let file = createFile(tests)
    await runner.onBeforeCollect([FILE])
    runner.onCollected([file])
    await simulateTest(runner, file, tests[0]!)
    runner.onStray(new Error('late one'))
    await simulateTest(runner, file, tests[1]!)
    runner.onAfterRunFiles([file])

    let records = (await readRecords())[`${hash}-0`]!

    expect(config.hookTimeout).toBe(BATCH_LIMITS.load.timeout)
    expect(records).toMatchObject([
      { message: 'late one', kind: 'late', mutant: 'm2', test: 'a' },
      {
        tries: [
          { timedOut: false, mutant: null },
          { timedOut: false, mutant: 'm1' },
          { timedOut: false, mutant: null },
          { timedOut: true, mutant: 'm2' },
        ],
        kind: 'test',
      },
      { abandoned: true, kind: 'end' },
    ])
    expect(tests[0]!.mode).toBe('skip')
    expect(tests[1]!.mode).toBe('skip')
  })

  it('claims the unit planned for the project of the file', async () => {
    setOptions('batch')
    writeBatchPlan(
      [{ mutants: ['m1'], hitLimit: 10, timeout: 20, id: 'a' }],
      'unit',
    )
    let { runner } = createRunner(10_000, 'unit')
    await runFile(runner, createFile([createTest('a')]))

    expect(Object.keys(await readRecords())).toStrictEqual([
      `${getFileHash(FILE, 'unit')}-0`,
    ])
  })

  it('skips every test of a file without a free unit', async () => {
    setOptions('batch')
    let { runner } = createRunner()
    let tests = [createTest('a')]
    await runFile(runner, createFile(tests))
    runner.onStray(new Error('ignored'))

    writePlan([])
    let second = createRunner().runner
    let other = [createTest('a')]
    await runFile(second, createFile(other))

    expect(tests[0]!.mode).toBe('skip')
    expect(other[0]!.mode).toBe('skip')
    await expect(readRecords()).resolves.toStrictEqual({})
  })

  it('runs the file with the mutant active from loading until a test kills it in an isolated run', async () => {
    setOptions('isolated')
    writePlan([ISOLATED_UNIT, ISOLATED_UNIT])
    let body: Body = runtime => {
      if (runtime.hit('m')) {
        throw new Error('killed')
      }
    }
    let { runner, config } = createRunner()
    let later = createSuite([createTest('d', body)])
    let tests = [
      createTest('a', () => {
        throw new Error('not reached')
      }),
      createTest('b'),
      createTest('c', body),
      later,
      createTest('e', body),
    ]
    await runFile(runner, createFile(tests), () => {
      getRuntime().hit('other')
      runner.onStray(new Error('load stray'))
    })
    let second = createRunner().runner
    let all = [createTest('a'), createTest('b', body), createTest('c', body)]
    await runFile(second, createFile(all))

    let records = await readRecords()

    expect(config.hookTimeout).toBe(ISOLATED_UNIT.limits.timeout)
    // A failure before the mutant was reached proves nothing, so the unit
    // goes on; the kill of `c` skips what has not started.
    expect(tests.map(task => task.mode)).toStrictEqual([
      'run',
      'run',
      'run',
      'skip',
      'skip',
    ])
    expect(records[`${hash}-0`]).toMatchObject([
      { tries: [{ reached: false, failed: true, mutant: 'm' }], kind: 'test' },
      { tries: [{ reached: false, mutant: 'm', hits: 0 }], kind: 'test' },
      {
        tries: [{ message: 'killed', reached: true, failed: true, hits: 1 }],
        kind: 'test',
      },
      { strays: ['load stray'], reached: true, kind: 'end', hits: 2, unit: 5 },
    ])
    expect(all[2]!.mode).toBe('skip')
    expect(records[`${hash}-1`]).toHaveLength(3)
    expect(records[`${hash}-1`]!.at(-1)).toMatchObject({ unit: 6, hits: 1 })
    expect(
      existsSync(path.join(directory, 'worker', String(process.pid))),
    ).toBe(true)
    expect(
      (await readdir(path.join(directory, 'done'))).toSorted(),
    ).toStrictEqual([`${hash}-0`, `${hash}-1`])
  })

  it('ends a unit after the cleanup of the worker-scoped fixtures', async () => {
    setOptions('isolated')
    writePlan([ISOLATED_UNIT])
    let { runner } = createRunner()
    let file = createFile([createTest('a')])
    let seen: (string | null)[] = []
    let ended: boolean[] = []
    runner.onCleanupWorkerContext!(async () => {
      seen.push(getRuntime().active)
      getRuntime().hit('m')
      ended.push(existsSync(path.join(directory, 'done', `${hash}-0`)))
      await Promise.resolve()
      throw new Error('2 left open\nstack')
    })
    await collectAndRun(runner, file)
    let before = await readRecords()

    expect(hasBeat()).toBe(true)
    await expect(tearDownWorker()).resolves.toMatchObject({
      message: '2 left open\nstack',
    })

    let records = (await readRecords())[`${hash}-0`]!

    expect(before[`${hash}-0`]!.map(record => record.kind)).toStrictEqual([
      'test',
    ])
    expect(seen).toStrictEqual(['m'])
    expect(ended).toStrictEqual([false])
    expect(records.at(-1)).toMatchObject({
      hookError: '2 left open',
      reached: true,
      kind: 'end',
      hits: 1,
    })
    expect(getRuntime().active).toBeNull()
    expect(hasBeat()).toBe(false)
  })

  it('ends a unit after the environment teardown, whose error fails it', async () => {
    setOptions('isolated')
    writePlan([ISOLATED_UNIT])
    let { runner } = createRunner()
    let file = createFile([createTest('a')])
    let seen: unknown[] = []
    runner.onCleanupWorkerContext!(() => {})
    await collectAndRun(runner, file)

    await expect(
      tearDownWorker(() => {
        seen.push(
          getRuntime().active,
          hasBeat(),
          readFileSync(path.join(directory, 'out', `${hash}-0.jsonl`), 'utf8')
            .trim()
            .split('\n')
            .map(line => (JSON.parse(line) as VitestOutRecord).kind),
        )
        throw new Error('1 left open\nstack')
      }),
    ).rejects.toThrow('1 left open')
    expect(seen).toStrictEqual(['m', true, ['test']])
    expect((await readRecords())[`${hash}-0`]!.at(-1)).toMatchObject({
      hookError: '1 left open',
      kind: 'end',
    })
    expect(getRuntime().active).toBeNull()
    expect(hasBeat()).toBe(false)
  })

  it('keeps the error of a failed cleanup over the environment teardown', async () => {
    setOptions('batch')
    writePlan([
      {
        tests: [{ mutants: ['m'], timeout: 1000, hitLimit: 10, id: 'a' }],
        limits: { load: { timeout: 1000, hitLimit: 10 }, total: 4000 },
        project: '',
        file: FILE,
      },
    ])
    let { runner } = createRunner()
    runner.onCleanupWorkerContext!(() => {
      throw new Error('cleanup')
    })
    let file = createFile([createTest('a')])
    await collectAndRun(runner, file)

    await expect(
      tearDownWorker(() => {
        throw new Error('environment')
      }),
    ).rejects.toThrow('environment')
    expect((await readRecords())[`${hash}-0`]!.at(-1)).toMatchObject({
      hookError: 'cleanup',
      kind: 'end',
    })
  })

  it('ends a unit after the cleanup when the teardown cannot be watched', async () => {
    setOptions('isolated')
    writePlan([ISOLATED_UNIT])
    workerState.ctx.traces = undefined
    let { runner } = createRunner()
    let file = createFile([createTest('a')])
    runner.onCleanupWorkerContext!(() => {})
    await collectAndRun(runner, file)
    await Promise.all(cleanups.splice(0).map(listener => listener()))

    expect(
      (await readRecords())[`${hash}-0`]!.map(record => record.kind),
    ).toStrictEqual(['test', 'end'])
  })

  it('writes no end record when the files never finished', async () => {
    setOptions('isolated')
    writePlan([ISOLATED_UNIT])
    let { runner } = createRunner()
    runner.onCleanupWorkerContext!(() => {})
    await runner.onBeforeCollect([FILE])
    await tearDownWorker()

    await expect(
      readFile(path.join(directory, 'out', `${hash}-0.jsonl`), 'utf8'),
    ).resolves.toBe('')
    expect(getRuntime().active).toBeNull()
  })

  it('ends a unit with its files without a teardown hook', async () => {
    setOptions('isolated')
    writePlan([ISOLATED_UNIT])
    let runner = createVmRunner()
    let file = createFile([createTest('a')])
    await collectAndRun(runner, file)

    expect(runner.onCleanupWorkerContext).toBeUndefined()
    expect(
      (await readRecords())[`${hash}-0`]!.map(record => record.kind),
    ).toStrictEqual(['test', 'end'])
  })

  it('reports no dependencies with a test environment of its own', async () => {
    setOptions('isolated')
    writePlan([ISOLATED_UNIT])
    let { environment } = workerState.ctx
    let runner = createVmRunner()
    let file = createFile([createTest('a')])
    await runner.onBeforeCollect([FILE])
    runner.onCollected([file])
    await runTasks(runner, file, file.tasks)
    workerState.ctx.environment = {
      ...environment,
      name: './test/environment.ts',
    }
    try {
      runner.onAfterRunFiles([file])
    } finally {
      workerState.ctx.environment = environment
    }

    expect((await readRecords())[`${hash}-0`]!.at(-1)).toMatchObject({
      dependencies: null,
      kind: 'end',
    })
  })

  it('keeps the own repeats and retries of a test within each try', async () => {
    setOptions('dry', true)
    let { runner } = createRunner()
    let calls = { repeated: 0, broken: 0, flaky: 0, once: 0 }
    let tests = [
      Object.assign(
        createTest('repeated', runtime => {
          calls.repeated += 1
          runtime.hit('x')
          if (calls.repeated === 1) {
            throw new Error('first repetition')
          }
        }),
        { repeats: 1 },
      ),
      Object.assign(
        createTest('flaky', () => {
          calls.flaky += 1
          if (calls.flaky === 1) {
            throw new Error('first attempt')
          }
        }),
        { retry: 1 },
      ),
      Object.assign(
        createTest('broken', () => {
          calls.broken += 1
          throw new Error(`attempt ${calls.broken}`)
        }),
        { retry: 1 },
      ),
    ]
    await runFile(runner, createFile(tests))
    let records = (await readRecords())[`${hash}-${process.pid}`]!

    expect(tests[0]!.repeats).toBe(3)
    expect(tests[1]!.retry).toBe(1)
    expect(calls).toStrictEqual({ repeated: 4, broken: 4, flaky: 3, once: 0 })
    expect(records.slice(0, 3)).toMatchObject([
      {
        tries: [
          { message: 'first repetition', failed: true, hits: 2 },
          { message: null, failed: false, hits: 2 },
        ],
      },
      {
        tries: [
          { message: null, failed: false },
          { message: null, failed: false },
        ],
      },
      {
        tries: [
          { message: 'attempt 2', failed: true },
          { message: 'attempt 4', failed: true },
        ],
      },
    ])
  })

  it('keeps the mutant of a batch try active through its repetitions', async () => {
    setOptions('batch')
    writeBatchPlan([
      { mutants: ['m1', 'm2'], timeout: 1000, hitLimit: 10, id: 'a' },
    ])
    let { runner } = createRunner()
    let active: (string | null)[] = []
    let tests = [
      Object.assign(
        createTest('a', runtime => {
          active.push(runtime.active)
          if (runtime.hit('m1') && active.length === 4) {
            throw new Error('second repetition')
          }
        }),
        { repeats: 1 },
      ),
    ]
    await runFile(runner, createFile(tests))
    let records = (await readRecords())[`${hash}-0`]!

    expect(tests[0]!.repeats).toBe(9)
    expect(active).toStrictEqual([
      null,
      null,
      'm1',
      'm1',
      null,
      null,
      'm2',
      'm2',
      null,
      null,
    ])
    expect(summarize(records)).toStrictEqual([
      [
        ['a', null, false, false],
        ['a', 'm1', true, true],
        ['a', null, false, false],
        ['a', 'm2', false, false],
        ['a', null, false, false],
      ],
      'end',
    ])
  })

  it('abandons a unit when a repetition of a try runs out of time', async () => {
    setOptions('batch')
    writeBatchPlan([{ mutants: ['m1'], hitLimit: 10, timeout: 20, id: 'a' }])
    let { runner } = createRunner()
    let tests = [
      Object.assign(
        createTest('a', runtime =>
          runtime.hit('m1') ? new Promise<void>(() => {}) : Promise.resolve(),
        ),
        { repeats: 1 },
      ),
    ]
    await runFile(runner, createFile(tests))
    let records = (await readRecords())[`${hash}-0`]!

    expect(records).toMatchObject([
      {
        tries: [
          { timedOut: false, mutant: null },
          { timedOut: true, mutant: 'm1' },
        ],
      },
      { abandoned: true, kind: 'end' },
    ])
  })

  it('gives the dry watchdog the timeouts of the hooks', async () => {
    setOptions('dry')
    let { runner } = createRunner(300)
    let beats: VitestHeartbeat[] = []
    let tests = [
      createTest('a', () => {
        beats.push(readBeat())
      }),
      Object.assign(
        createTest('b', () => {
          beats.push(readBeat())
        }),
        { timeout: 0 },
      ),
    ]
    let file = createFile(tests)
    let fileHooks = getHooks(file)!
    fileHooks['beforeEach']!.push(
      Object.assign(() => {}, {
        [Symbol.for('VITEST_CLEANUP_TIMEOUT')]: 200,
      }),
    )
    fileHooks['afterAll']!.push(() => {})
    await runner.onBeforeCollect([FILE])
    runner.onCollected([file])
    let outside = readBeat().budget
    await runTasks(runner, file, tests)
    let after = readBeat().budget
    runner.onAfterRunFiles([file])

    expect(outside).toBe(TIMEOUTS.file + 300 + 1000)
    expect(after).toBe(outside)
    expect(beats.map(beat => beat.budget)).toStrictEqual([
      TIMEOUTS.test + 1000 + 2 * 200 + 1000,
      2 ** 31 - 1 + 1000,
    ])
  })

  it('records a test that skipped itself at the next suite or the end', async () => {
    setOptions('dry', true)
    let { runner } = createRunner()
    let skip: Body = () => {
      throw Object.assign(new Error('skipped'), { skip: true })
    }
    let file = createFile([
      createTest('a', skip),
      createSuite(
        [createTest('b', skip)],
        [{ message: 'Obsolete snapshots found' }, { message: 'afterAll boom' }],
      ),
      createTest('c', skip),
    ])
    await runner.onBeforeRunTask(createSuite([]))
    await runFile(runner, file)

    expect(
      (await readRecords())[`${hash}-${process.pid}`]!.map(record =>
        record.kind === 'test' ?
          [record.name, record.tries.map(facts => facts.skipped)]
        : [record.kind, record.kind === 'end' ? record.hookError : null],
      ),
    ).toStrictEqual([
      ['suite > a', [true]],
      ['suite > b', [true]],
      ['suite > c', [true]],
      ['end', 'afterAll boom'],
    ])
  })

  it('tries each test once in a dry run without repeats', async () => {
    setOptions('dry')
    let { runner } = createRunner()
    let file = createFile([createTest('a'), createTest('b')])
    await runFile(runner, file)

    expect(
      (await readRecords())[`${hash}-${process.pid}`]!.flatMap(record =>
        record.kind === 'test' ? [[record.name, record.tries.length]] : [],
      ),
    ).toStrictEqual([
      ['suite > a', 1],
      ['suite > b', 1],
    ])
  })

  it('keeps concurrent tests concurrent in a dry run that tries each once', async () => {
    setOptions('dry')
    let { runner } = createRunner()
    let gates = {
      bRunning: Promise.withResolvers<undefined>(),
      cSkipped: Promise.withResolvers<undefined>(),
      aEnded: Promise.withResolvers<undefined>(),
    }
    let beats: VitestHeartbeat[] = []
    let a = Object.assign(
      createTest('a', async runtime => {
        await gates.bRunning.promise
        runtime.hit('both')
        runner.onStray(new Error('shared'))
      }),
      { concurrent: true, timeout: 5000 },
    )
    let b = Object.assign(
      createTest('b', async runtime => {
        beats.push(readBeat())
        gates.bRunning.resolve(undefined)
        await gates.aEnded.promise
        runtime.hit('b-only')
        await gates.cSkipped.promise
        await runner.onBeforeRunSuite(createSuite([]))
        beats.push(readBeat())
      }),
      { concurrent: true },
    )
    let skipper = Object.assign(
      createTest('c', async () => {
        await gates.aEnded.promise
        throw Object.assign(new Error('skipped'), { skip: true })
      }),
      { concurrent: true },
    )
    let file = createFile([a, b, skipper])
    runner.onCleanupWorkerContext!(() => {})
    await runner.onBeforeCollect([FILE])
    getRuntime().hit('load')
    runner.onCollected([file])
    await Promise.all([
      (async () => {
        await simulateTest(runner, file, a)
        gates.aEnded.resolve(undefined)
      })(),
      simulateTest(runner, file, b),
      (async () => {
        await simulateTest(runner, file, skipper)
        gates.cSkipped.resolve(undefined)
      })(),
    ])
    runner.onAfterRunFiles([file])
    await tearDownWorker()

    expect(file.tasks.map(task => task.concurrent)).toStrictEqual([
      true,
      true,
      true,
    ])
    // The later end of the running attempts, less the time since it began.
    expect(
      beats.map(beat => [beat.test, Math.round(beat.budget / 10) * 10]),
    ).toStrictEqual([
      ['a', 6050],
      ['b', 2050],
    ])
    expect(
      (await readRecords())[`${hash}-${process.pid}`]!.map(record => {
        if (record.kind === 'test') {
          return record.tries.map(facts => [
            facts.test,
            facts.covers,
            facts.strays,
            facts.hits,
            facts.skipped,
          ])
        }
        return record.kind === 'end' ?
            [record.kind, record.concurrent, record.hits]
          : record.kind
      }),
    ).toStrictEqual([
      [['a', ['both'], ['shared'], 1, false]],
      [['c', ['b-only', 'both'], ['shared'], 2, true]],
      [['b', ['b-only', 'both'], ['shared'], 2, false]],
      ['end', true, 1],
    ])
  })

  it('records a collection failure without running tests', async () => {
    setOptions('dry', true)
    let { runner } = createRunner()
    let file = createFile([createTest('a')])
    file.result = { errors: [{ message: 'collect' }], state: 'fail' } as never
    await runFile(runner, file)

    expect((await readRecords())[`${hash}-${process.pid}`]).toMatchObject([
      { loadError: 'collect', hookError: null, kind: 'end' },
    ])
  })

  it('sends unhandled errors to the runner of the current file', () => {
    setOptions('dry', true)
    let first = createRunner().runner
    let second = createRunner().runner
    let stray = vi.spyOn(second, 'onStray').mockReturnValue()
    let ignored = vi.spyOn(first, 'onStray').mockReturnValue()
    let added = process
      .listeners('unhandledRejection')
      .filter(listener => !listeners.unhandledRejection.includes(listener))
    let thrown = process
      .listeners('uncaughtException')
      .filter(listener => !listeners.uncaughtException.includes(listener))

    expect(added).toHaveLength(1)
    expect(thrown).toHaveLength(1)

    let error = new Error('stray')
    ;(added[0] as (reason: unknown) => void)(error)
    ;(thrown[0] as (reason: unknown) => void)(error)

    expect(stray).toHaveBeenCalledTimes(2)
    expect(ignored).not.toHaveBeenCalled()
  })
})
