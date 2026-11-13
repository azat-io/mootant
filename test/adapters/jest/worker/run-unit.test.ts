import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { realpath, mkdtemp, rm } from 'node:fs/promises'
import { AsyncLocalStorage } from 'node:async_hooks'
import { runInNewContext } from 'node:vm'
import { tmpdir } from 'node:os'
import path from 'node:path'
import fs from 'node:fs'

import type { JestTimedRecord } from '../../../../adapters/jest/types/jest-timed-record'
import type { JestTestRunner } from '../../../../adapters/jest/types/jest-test-runner'
import type { JestFileResult } from '../../../../adapters/jest/types/jest-file-result'
import type { BootedProject } from '../../../../adapters/jest/types/booted-project'
import type { UnitWorker } from '../../../../adapters/jest/types/unit-worker'
import type { JestUnit } from '../../../../adapters/jest/types/jest-unit'
import type { VmSide } from '../../../../adapters/jest/types/vm-side'

import { createWorkerChannel } from '../../../../adapters/jest/worker/create-worker-channel'
import { createTestRuntime } from '../../../helpers/create-test-runtime'
import { readOutFile } from '../../../../adapters/shared/read-out-file'
import { runUnit } from '../../../../adapters/jest/worker/run-unit'

/**
 * What happened in a fake `TestRunner`.
 */
interface RunnerLog {
  /**
   * Arguments of each `runTests`.
   */
  runs: Parameters<JestTestRunner['runTests']>[]

  /**
   * Global configuration each runner got.
   */
  globals: Record<string, unknown>[]

  /**
   * `JEST_WORKER_ID` right after `runTests` started its asynchronous work.
   */
  ids: (undefined | string)[]

  /**
   * Second argument each runner got.
   */
  contexts: object[]
}

/**
 * What a fake `TestRunner` does when its `runTests` is called, after it set
 * `JEST_WORKER_ID` as the real one does.
 */
type RunnerScript = (runner: {
  emit(event: 'test-file-success', payload: JestFileResult): void
  emit(event: 'test-file-failure', payload: unknown): void
}) => Promise<void> | void

/**
 * Temporary directory of the current test.
 */
let directory = ''

/**
 * Environment of the fake process.
 */
let env: Record<string, undefined | string> = {}

/**
 * Out files made so far in the current test.
 */
let units = 0

/**
 * What happened in the fake `TestRunner` of the current test.
 */
let log: RunnerLog = { contexts: [], globals: [], runs: [], ids: [] }

/**
 * Creates what the boot of a worker makes.
 *
 * @param script - What its `TestRunner` does.
 * @param fields - Fields that differ.
 * @returns What a unit gets.
 */
function createWorker(
  script: RunnerScript = givesNoTests,
  fields: Partial<UnitWorker> = {},
): UnitWorker {
  let project: BootedProject = {
    config: {
      testEnvironment: '/environment',
      moduleFileExtensions: ['js'],
      transformIgnorePatterns: [],
      snapshotSerializers: [],
      setupFilesAfterEnv: [],
      testRunner: '/circus',
      runner: '/runner',
      setupFiles: [],
      rootDir: '/p',
      transform: [],
      roots: ['/p'],
      id: 'p',
    },
    resolver: { resolver: 'of p' },
    moduleMap: { map: 'of p' },
    wrapped: new Map(),
    configString: '{}',
  }
  return {
    process: {
      getActiveResourcesInfo: () => [],
      removeAllListeners: () => {},
      stderr: { write: () => {} },
      getBuiltinModule: () => {},
      umask: () => 0o022,
      exit: () => {},
      cwd: () => '/',
      on: () => {},
      execArgv: [],
      stdout: {},
      env,
    },
    calls: {
      asyncTransformer: new AsyncLocalStorage(),
      asyncResolver: new AsyncLocalStorage(),
      environment: new AsyncLocalStorage(),
      defaultResolver: 0,
      transformer: 0,
      unsettled: 0,
      resolver: 0,
    },
    getConsoleOutput: (buffer, config, globalConfig) =>
      `${JSON.stringify(buffer)} of ${(config as { id: string }).id}, verbose ${String((globalConfig as { verbose: boolean }).verbose)}\n`,
    globalConfig: {
      detectOpenHandles: false,
      updateSnapshot: 'all',
      collectCoverage: true,
      testSequencer: '/s',
      maxWorkers: 2,
    } as UnitWorker['globalConfig'],
    reads: {
      extensions: new Set(['snap', 'js']),
      temporary: ['/temporary'],
      directories: [directory],
    },
    Resolver: { clearDefaultResolverCache: vi.fn<() => void>() },
    clearPerformance: vi.fn<() => void>(),
    checkState: () => Promise.resolve([]),
    BufferedConsole: createConsoleClass(),
    TestRunner: createRunnerClass(script),
    projects: new Map([['p', project]]),
    channel: createWorkerChannel(),
    flags: { stale: false },
    disableStores: () => {},
    directory: '/w/jest',
    dead: new WeakSet(),
    outside: new Set(),
    requireCache: {},
    tracked: true,
    early: false,
    slot: '3',
    ...fields,
  }
}

/**
 * Creates a fake `TestRunner` class.
 *
 * @param script - What it does when it runs.
 * @returns A class that logs what it gets.
 */
function createRunnerClass(script: RunnerScript): UnitWorker['TestRunner'] {
  /**
   * A `TestRunner` that logs what it gets and runs the script.
   */
  return class FakeRunner implements JestTestRunner {
    /**
     * Listeners by event.
     */
    private readonly listeners = new Map<
      string,
      (payload: [test: unknown, value: never]) => void
    >()

    /**
     * Logs what the runner gets.
     *
     * @param globalConfig - Global configuration.
     * @param context - Second argument of the real constructor.
     */
    public constructor(globalConfig: object, context: object) {
      log.globals.push(globalConfig as Record<string, unknown>)
      log.contexts.push(context)
    }

    /**
     * Logs its arguments and `JEST_WORKER_ID` as it starts, then runs the
     * script.
     *
     * @param parameters - Arguments of the real `runTests`.
     */
    public async runTests(
      ...parameters: Parameters<JestTestRunner['runTests']>
    ): Promise<void> {
      log.runs.push(parameters)
      env['JEST_WORKER_ID'] = '1'
      await Promise.resolve()
      log.ids.push(env['JEST_WORKER_ID'])
      await script({
        emit: (event: string, payload: unknown) => {
          this.listeners.get(event)!([{}, payload as never])
        },
      })
    }

    /**
     * Keeps the listener of an event.
     *
     * @param event - Name of the event.
     * @param listener - Receives its payload.
     */
    public on(
      event: string,
      listener: (payload: [test: unknown, value: never]) => void,
    ): void {
      this.listeners.set(event, listener)
    }
  }
}

/**
 * Creates what a vm's setup registers.
 *
 * @param fields - Fields that differ.
 * @returns The side, whose stops are spies.
 */
function createSide(fields: Partial<VmSide> = {}): VmSide {
  return {
    runtime: createTestRuntime({ coverage: new Set<string>(), hitLimit: 0 }),
    realmError: runInNewContext('Error') as ErrorConstructor,
    addVariable: vi.fn<(name: string) => void>(),
    stopTimers: vi.fn<() => void>(),
    close: vi.fn<() => void>(),
    listVariables: () => [],
    isReached: () => false,
    ...fields,
  }
}

/**
 * Reads the `finish` record of a unit.
 *
 * @param unit - Unit that ended.
 * @returns Its last record.
 */
function readFinish(
  unit: JestUnit,
): Extract<JestTimedRecord, { kind: 'finish' }> {
  let records = readOutFile(unit.out) as JestTimedRecord[]
  let last = records.at(-1)!
  if (last.kind !== 'finish') {
    throw new Error(`The last record is ${last.kind}.`)
  }
  return last
}

/**
 * Builds a unit with a new out file.
 *
 * @param fields - Fields that differ.
 * @returns The unit of a dry run with no plan.
 */
function createUnit(fields: Partial<JestUnit> = {}): JestUnit {
  units += 1
  return {
    out: path.join(directory, `${units}.jsonl`),
    file: '/a.test.js',
    console: 'buffer',
    project: 'p',
    mutant: null,
    plan: null,
    ...fields,
  }
}

/**
 * Creates a stand-in for `BufferedConsole`, whose `write` keeps an entry with
 * an origin, as Jest's does.
 *
 * @returns The class, as much of it as a unit uses.
 */
function createConsoleClass(): UnitWorker['BufferedConsole'] {
  return {
    write(buffer, type, message) {
      buffer.push({ origin: 'at the call', message, type })
      return buffer
    },
  }
}

/**
 * A script that gives a result with no tests, which reads as an empty file.
 *
 * @param runner - Fake runner.
 * @param runner.emit - Sends its events.
 */
function givesNoTests(runner: Parameters<RunnerScript>[0]): void {
  runner.emit('test-file-success', {
    snapshot: { fileDeleted: false, unchecked: 0, unmatched: 0 },
    testResults: [],
  })
}

describe('runUnit', () => {
  beforeEach(async () => {
    directory = await realpath(
      await mkdtemp(path.join(tmpdir(), 'mootant-unit-')),
    )
    log = { contexts: [], globals: [], runs: [], ids: [] }
    units = 0
    env = {}
  })

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true })
  })

  it('runs the test file with the project through Jest in serial mode', async () => {
    let worker = createWorker()
    let unit = createUnit()
    await runUnit(unit, worker)
    let [tests, watcher, options] = log.runs[0]!
    let project = worker.projects.get('p')!

    expect(log.contexts).toStrictEqual([{}])
    expect(tests).toStrictEqual([
      {
        context: {
          config: expect.objectContaining({
            setupFiles: ['/w/jest/vm-setup.cjs', '/w/jest/vm-setup-end.cjs'],
            id: 'p',
          }) as object,
          moduleMap: project.moduleMap,
          resolver: project.resolver,
        },
        duration: undefined,
        path: '/a.test.js',
      },
    ])
    expect(watcher.isInterrupted()).toBe(false)
    expect(options).toStrictEqual({ serial: true })
  })

  it('sets JEST_WORKER_ID synchronously after runTests is called', async () => {
    await runUnit(createUnit(), createWorker())

    expect(log.ids).toStrictEqual(['3'])
    expect(env['JEST_WORKER_ID']).toBe('3')
  })

  it('keeps the wrapped configuration per plan', async () => {
    let worker = createWorker()
    await runUnit(createUnit({ plan: '/plans/1/plan.json' }), worker)
    await runUnit(createUnit({ plan: '/plans/1/plan.json' }), worker)
    await runUnit(createUnit({ plan: '/plans/2/plan.json' }), worker)
    await runUnit(createUnit(), worker)
    let configs = log.runs.map(([tests]) => tests[0]!.context.config)

    expect(configs[1]).toBe(configs[0])
    expect(configs[2]).not.toBe(configs[0])
    expect(configs[3]).not.toBe(configs[0])
    expect(configs[3]).not.toBe(configs[2])
  })

  it('makes a global copy that picks the console of the unit, and never updates snapshots', async () => {
    let worker = createWorker()
    await runUnit(createUnit({ console: 'stream' }), worker)
    await runUnit(createUnit({ console: 'buffer', mutant: 'm' }), worker)
    await runUnit(createUnit({ console: 'none', mutant: 'm' }), worker)
    let base = {
      detectOpenHandles: false,
      updateSnapshot: 'none',
      collectCoverage: false,
      testSequencer: '/s',
      maxWorkers: 2,
    }

    expect(log.globals).toStrictEqual([
      { ...base, verbose: true, silent: false },
      { ...base, verbose: false, silent: false },
      { ...base, verbose: false, silent: true },
    ])
    expect(worker.globalConfig).toMatchObject({ updateSnapshot: 'all' })
  })

  it("writes what a console kept as Jest's reporters show it, from the plain project and the global copy", async () => {
    let worker = createWorker(runner => {
      runner.emit('test-file-success', {
        console: [{ message: 'logged', origin: 'at a', type: 'log' }],
        snapshot: { fileDeleted: false, unchecked: 0, unmatched: 0 },
        testResults: [{ ancestorTitles: [], title: 'logs' }],
      })
    })
    let unit = createUnit()
    let mutated = createUnit({ mutant: 'm' })
    await runUnit(unit, worker)
    await runUnit(mutated, worker)

    expect(readFinish(unit).consoleOutput).toBe(
      '  ● Console\n\n[{"message":"logged","origin":"at a","type":"log"}] of p, verbose false\n\n',
    )
    expect(readFinish(mutated).consoleOutput).toBeNull()
  })

  it('empties what a console kept once the unit wrote it, with a mutant or not, as a vm of ES modules stays in the worker with its console', async () => {
    let buffers: object[][] = []
    let worker = createWorker(runner => {
      let buffer = [{ message: 'logged', origin: 'at a', type: 'log' }]
      buffers.push(buffer)
      runner.emit('test-file-success', {
        snapshot: { fileDeleted: false, unchecked: 0, unmatched: 0 },
        testResults: [{ ancestorTitles: [], title: 'logs' }],
        console: buffer,
      })
    })
    let unit = createUnit()
    await runUnit(unit, worker)
    await runUnit(createUnit({ mutant: 'm' }), worker)

    expect(readFinish(unit).consoleOutput).toContain('"message":"logged"')
    expect(buffers).toStrictEqual([[], []])
  })

  it.each([
    [true, ['HOME', '*']],
    [false, ['HOME']],
  ])(
    'gives a unit every variable as an input when the worker met an early promisified execFile: %s',
    async (early, variables) => {
      let seen = ['HOME']
      let worker = createWorker(
        runner => {
          worker.channel.vm = createSide({
            addVariable: name => {
              seen.push(name)
            },
            listVariables: () => seen,
          })
          givesNoTests(runner)
        },
        { early },
      )
      let unit = createUnit()
      await runUnit(unit, worker)

      expect(readFinish(unit).variables).toStrictEqual(variables)
    },
  )

  it('writes finish for a file that gave a result, with what the vm counted, and closes the file', async () => {
    let side = createSide({
      runtime: createTestRuntime({
        coverage: new Set(['z', 'a']),
        hitLimit: 0,
        hits: 7,
      }),
      listVariables: () => ['HOME'],
      isReached: () => true,
    })
    let worker = createWorker(
      runner => {
        worker.channel.vm = side
        runner.emit('test-file-success', {
          testResults: [
            { location: { line: 2 }, ancestorTitles: [], title: 'adds' },
          ],
          snapshot: { fileDeleted: false, unchecked: 1, unmatched: 2 },
          failureMessage: 'the text',
        })
      },
      { outside: new Set(['outside-1']) },
    )
    let unit = createUnit()

    await expect(runUnit(unit, worker)).resolves.toBe(false)
    expect(readFinish(unit)).toStrictEqual({
      time: expect.any(Number) as number,
      failureMessage: 'the text',
      outside: ['outside-1'],
      consoleOutput: null,
      variables: ['HOME'],
      covers: ['a', 'z'],
      lines: { adds: 2 },
      outcome: 'result',
      execError: null,
      kind: 'finish',
      transforms: [],
      message: null,
      tracked: true,
      snapshots: 3,
      realm: null,
      loaded: [],
      writes: [],
      dirty: [],
      reads: [],
      hits: 7,
    })

    worker.channel.write(worker.channel.token, { kind: 'start' })

    expect((readOutFile(unit.out) as JestTimedRecord[]).at(-1)!.kind).toBe(
      'finish',
    )
  })

  it('writes finish for a file with no tests', async () => {
    let unit = createUnit()
    await runUnit(unit, createWorker())

    expect(readFinish(unit)).toMatchObject({
      message: 'Your test suite must contain at least one test.',
      outcome: 'empty',
    })
  })

  it('writes finish for a file that could not run, with the stack and the realm of the vm', async () => {
    let side = createSide()
    let { realmError: VmError } = side
    let error = new VmError('the setup broke\nmore')
    let worker = createWorker(runner => {
      worker.channel.vm = side
      runner.emit('test-file-failure', error)
    })
    let unit = createUnit()
    await runUnit(unit, worker)

    expect(readFinish(unit)).toMatchObject({
      failureMessage: error.stack,
      message: 'the setup broke',
      outcome: 'failure',
      realm: 'current',
      execError: null,
      snapshots: 0,
      lines: {},
    })
  })

  it.each<[string, () => unknown, string]>([
    ['a primitive', () => 'plain text', 'plain text'],
    ['an error with no stack', () => ({ message: 'no stack' }), 'no stack'],
    ['a stack that is no string', () => ({ message: 'odd', stack: 3 }), 'odd'],
    [
      'an object whose stack throws',
      () => ({
        get stack(): string {
          throw new Error('odd getter')
        },
        message: 'kept',
      }),
      'kept',
    ],
    [
      'a proxy that throws on every read',
      () =>
        new Proxy(
          {},
          {
            get() {
              throw new Error('odd proxy')
            },
          },
        ),
      'An error mootant cannot read.',
    ],
  ])(
    'takes the message as the failure text of %s',
    async (_name, make, text) => {
      let worker = createWorker(runner => {
        runner.emit('test-file-failure', make())
      })
      let unit = createUnit()

      await expect(runUnit(unit, worker)).resolves.toBe(false)
      expect(readFinish(unit)).toMatchObject({
        failureMessage: text,
        outcome: 'failure',
        message: text,
      })
    },
  )

  it('reads a failure with no side as of the host realm, with zeros and empty lists', async () => {
    let worker = createWorker(runner => {
      runner.emit('test-file-failure', new Error('the environment broke'))
    })
    let unit = createUnit()

    await expect(runUnit(unit, worker)).resolves.toBe(false)
    expect(readFinish(unit)).toMatchObject({
      message: 'the environment broke',
      variables: [],
      realm: 'host',
      covers: [],
      hits: 0,
    })
  })

  it('has no covers when the side collects none', async () => {
    let side = createSide({
      runtime: createTestRuntime({ hitLimit: 0, active: 'm', hits: 2 }),
    })
    let worker = createWorker(runner => {
      worker.channel.vm = side
      givesNoTests(runner)
    })
    let unit = createUnit({ mutant: 'm' })
    await runUnit(unit, worker)

    expect(readFinish(unit)).toMatchObject({ covers: [], hits: 2 })
  })

  it('stops the timers of the side, marks its Error dead and closes its runtime, each once', async () => {
    let side = createSide()
    let worker = createWorker(runner => {
      worker.channel.vm = side
      givesNoTests(runner)
    })
    await runUnit(createUnit(), worker)

    expect(side.stopTimers).toHaveBeenCalledExactlyOnceWith()
    expect(side.close).toHaveBeenCalledExactlyOnceWith()
    expect(worker.dead.has(side.realmError)).toBe(true)
  })

  it('reads an error of the vm of an ended unit as stale in a later one', async () => {
    let side = createSide()
    let worker = createWorker(runner => {
      worker.channel.vm = side
      givesNoTests(runner)
    })
    await runUnit(createUnit(), worker)
    let { realmError: VmError } = side
    let later = new VmError('left by the first unit')
    worker.TestRunner = createRunnerClass(runner => {
      runner.emit('test-file-failure', later)
    })
    let unit = createUnit()
    await runUnit(unit, worker)

    expect(readFinish(unit).realm).toBe('stale')
  })

  it('makes a stale event the last unit, and clears the flag for the next', async () => {
    let worker = createWorker()
    worker.TestRunner = createRunnerClass(runner => {
      worker.flags.stale = true
      givesNoTests(runner)
    })

    await expect(runUnit(createUnit(), worker)).resolves.toBe(true)

    worker.TestRunner = createRunnerClass(givesNoTests)

    await expect(runUnit(createUnit(), worker)).resolves.toBe(false)
    expect(worker.flags.stale).toBe(false)
  })

  it('makes a unit that ends with a transform unsettled the last unit, and not one whose transform settled first', async () => {
    let worker = createWorker()
    worker.TestRunner = createRunnerClass(runner => {
      worker.calls.unsettled = 1
      givesNoTests(runner)
    })

    await expect(runUnit(createUnit(), worker)).resolves.toBe(true)

    worker.TestRunner = createRunnerClass(runner => {
      worker.calls.unsettled = 0
      givesNoTests(runner)
    })

    await expect(runUnit(createUnit(), worker)).resolves.toBe(false)
  })

  it.each<[string, RunnerScript]>([
    [
      'a failed test',
      runner => {
        runner.emit('test-file-success', {
          snapshot: { fileDeleted: false, unchecked: 0, unmatched: 0 },
          testResults: [{ ancestorTitles: [], title: 'fails' }],
          failureMessage: 'the test failed',
        })
      },
    ],
    [
      'a failure of the file',
      runner => {
        runner.emit('test-file-failure', new Error('the setup broke'))
      },
    ],
    ['a file with no tests', givesNoTests],
  ])(
    'clears the file cache of jest-resolve after %s',
    async (_name, script) => {
      let worker = createWorker(script)
      await runUnit(createUnit(), worker)

      expect(
        worker.Resolver.clearDefaultResolverCache,
      ).toHaveBeenCalledExactlyOnceWith()
    },
  )

  it('keeps the file cache of jest-resolve after a pass', async () => {
    let worker = createWorker(runner => {
      runner.emit('test-file-success', {
        snapshot: { fileDeleted: false, unchecked: 0, unmatched: 0 },
        testResults: [{ ancestorTitles: [], title: 'passes' }],
      })
    })
    await runUnit(createUnit(), worker)

    expect(worker.Resolver.clearDefaultResolverCache).not.toHaveBeenCalled()
  })

  it('clears the marks of the unit, whether or not its vm got set up', async () => {
    let worker = createWorker()
    await runUnit(createUnit(), worker)

    expect(worker.clearPerformance).toHaveBeenCalledExactlyOnceWith()
  })

  it('makes a dirty guard the last unit', async () => {
    let worker = createWorker(givesNoTests, {
      checkState: () => Promise.resolve(['cwd', 'fs.close']),
    })
    let unit = createUnit()

    await expect(runUnit(unit, worker)).resolves.toBe(true)
    expect(readFinish(unit).dirty).toStrictEqual(['cwd', 'fs.close'])
  })

  it('reads a guard that rejects as a reason and the last unit, and does not throw', async () => {
    let worker = createWorker(givesNoTests, {
      checkState: () =>
        Promise.reject(new Error('ENOENT: no such file or directory, uv_cwd')),
    })
    let unit = createUnit()

    await expect(runUnit(unit, worker)).resolves.toBe(true)
    expect(readFinish(unit).dirty).toStrictEqual([
      'guard: ENOENT: no such file or directory, uv_cwd',
    ])
  })

  it("keeps what the test environment reads in its window or its handler apart from the reads, as the session's", async () => {
    let setup = path.join(directory, 'setup.json')
    let handled = path.join(directory, 'handled.json')
    let own = path.join(directory, 'own.json')
    for (let file of [setup, handled, own]) {
      fs.writeFileSync(file, '')
    }
    let worker = createWorker(runner => {
      worker.channel.vm = createSide()
      worker.calls.environment.run(true, () => fs.readFileSync(setup))
      worker.calls.environment.run(true, () => fs.readFileSync(handled))
      fs.readFileSync(own)
      givesNoTests(runner)
    })
    let unit = createUnit()
    await runUnit(unit, worker)

    expect(readFinish(unit)).toMatchObject({
      transforms: [handled, setup],
      reads: [own],
    })
  })

  it('counts reads and writes of the unit alone', async () => {
    let kept = path.join(directory, 'kept.txt')
    let changed = path.join(directory, 'changed.txt')
    fs.writeFileSync(kept, '')
    fs.writeFileSync(changed, '')
    let worker = createWorker(runner => {
      worker.channel.vm = createSide()
      fs.readFileSync(kept)
      fs.readFileSync(changed)
      fs.writeFileSync(changed, 'new')
      givesNoTests(runner)
    })
    let unit = createUnit()
    await runUnit(unit, worker)

    expect(readFinish(unit)).toMatchObject({
      reads: [changed, kept],
      writes: [changed],
    })

    worker.TestRunner = createRunnerClass(givesNoTests)
    let next = createUnit()
    await runUnit(next, worker)

    expect(readFinish(next)).toMatchObject({ writes: [], reads: [] })
  })

  it('counts a read under a directory of the session whatever its name, and one with an extension of the session wherever it is', async () => {
    let worker = createWorker(runner => {
      worker.channel.vm = createSide()
      for (let file of [
        path.join(directory, 'data/table.txt'),
        '/elsewhere/snapshots/a.test.js.snap',
        '/elsewhere/module.js',
        '/elsewhere/data.txt',
        '/elsewhere',
        directory,
      ]) {
        fs.existsSync(file)
      }
      givesNoTests(runner)
    })
    let unit = createUnit()
    await runUnit(unit, worker)

    expect(readFinish(unit).reads).toStrictEqual([
      '/elsewhere/module.js',
      '/elsewhere/snapshots/a.test.js.snap',
      path.join(directory, 'data/table.txt'),
    ])
  })

  it('leaves out a file in the temporary directory that only its extension would count, and keeps one under a directory of the session', async () => {
    let temporary = path.dirname(directory)
    let worker = createWorker(
      runner => {
        worker.channel.vm = createSide()
        for (let file of [
          path.join(temporary, 'other/module.js'),
          path.join(directory, 'kept.js'),
          '/elsewhere/module.js',
        ]) {
          fs.existsSync(file)
        }
        givesNoTests(runner)
      },
      {
        reads: {
          extensions: new Set(['js']),
          directories: [directory],
          temporary: [temporary],
        },
      },
    )
    let unit = createUnit()
    await runUnit(unit, worker)

    expect(readFinish(unit).reads).toStrictEqual([
      '/elsewhere/module.js',
      path.join(directory, 'kept.js'),
    ])
  })

  it("leaves out what Jest's own resolver reads, as it keeps what it found across units and a real load is read anyway", async () => {
    let routing = path.join(directory, 'routing.json')
    let probed = path.join(directory, 'probed.js')
    let loaded = path.join(directory, 'loaded.js')
    fs.writeFileSync(routing, '{}')
    let worker = createWorker(runner => {
      worker.channel.vm = createSide()
      worker.calls.resolver += 1
      fs.existsSync(probed)
      fs.readFileSync(routing)
      worker.calls.resolver -= 1
      fs.existsSync(loaded)
      givesNoTests(runner)
    })
    let unit = createUnit()
    await runUnit(unit, worker)

    expect(readFinish(unit)).toMatchObject({ reads: [loaded], transforms: [] })
  })

  it("keeps what the project's own resolver reads apart from the reads, a file it only looks for too, as Jest keeps what it resolved across units, but not what Jest's default resolver reads for it", async () => {
    let routing = path.join(directory, 'routing.json')
    let flag = path.join(directory, 'use-new.flag')
    let probed = path.join(directory, 'probed.js')
    fs.writeFileSync(routing, '{}')
    let worker = createWorker(runner => {
      worker.channel.vm = createSide()
      worker.calls.resolver += 1
      fs.existsSync(flag)
      fs.readFileSync(routing)
      worker.calls.defaultResolver += 1
      fs.existsSync(probed)
      worker.calls.defaultResolver -= 1
      worker.calls.resolver -= 1
      givesNoTests(runner)
    })
    worker.projects.get('p')!.config.resolver = path.join(
      directory,
      'resolver.js',
    )
    let unit = createUnit()
    await runUnit(unit, worker)

    expect(readFinish(unit)).toMatchObject({
      transforms: [routing, flag],
      reads: [],
    })
  })

  it("keeps what the project's own asynchronous resolver reads after an await apart from the reads, as Jest keeps what it resolved across units", async () => {
    let routing = path.join(directory, 'routing.json')
    fs.writeFileSync(routing, '{}')
    let worker = createWorker(async runner => {
      worker.channel.vm = createSide()
      await worker.calls.asyncResolver.run(true, async () => {
        await Promise.resolve()
        fs.readFileSync(routing)
      })
      givesNoTests(runner)
    })
    worker.projects.get('p')!.config.resolver = path.join(
      directory,
      'resolver.js',
    )
    let unit = createUnit()
    await runUnit(unit, worker)

    expect(readFinish(unit)).toMatchObject({ transforms: [routing], reads: [] })
  })

  it('keeps what a transformer reads apart from the reads, but a file the code wrote first', async () => {
    let config = path.join(directory, 'transform.json')
    let written = path.join(directory, 'written.js')
    let read = path.join(directory, 'read.js')
    fs.writeFileSync(config, '{}')
    let worker = createWorker(runner => {
      worker.channel.vm = createSide()
      fs.writeFileSync(written, '')
      worker.calls.transformer += 1
      fs.readFileSync(config)
      fs.existsSync(written)
      worker.calls.transformer -= 1
      fs.existsSync(read)
      givesNoTests(runner)
    })
    let unit = createUnit()
    await runUnit(unit, worker)

    expect(readFinish(unit)).toMatchObject({
      transforms: [config],
      reads: [read],
    })
  })

  it('keeps what an asynchronous transformer call reads apart, but not what is read while it waits', async () => {
    let config = path.join(directory, 'transform.json')
    let other = path.join(directory, 'other.js')
    fs.writeFileSync(config, '{}')
    let worker = createWorker(async runner => {
      worker.channel.vm = createSide()
      let release!: () => void
      let waiting = new Promise<void>(resolve => {
        release = resolve
      })
      let call = worker.calls.asyncTransformer.run(true, async () => {
        await waiting
        fs.readFileSync(config)
      })
      fs.existsSync(other)
      release()
      await call
      givesNoTests(runner)
    })
    let unit = createUnit()
    await runUnit(unit, worker)

    expect(readFinish(unit)).toMatchObject({
      transforms: [config],
      reads: [other],
    })
  })

  it('keeps apart what is read before the vm is set up, as a test environment loads once in a worker, but the test file Jest reads first', async () => {
    let policy = path.join(directory, 'policy.json')
    let later = path.join(directory, 'later.json')
    fs.writeFileSync(policy, '{}')
    fs.writeFileSync(later, '{}')
    let unit = createUnit({ file: path.join(directory, 'a.test.js') })
    fs.writeFileSync(unit.file, '')
    let worker = createWorker(runner => {
      fs.readFileSync(unit.file)
      fs.readFileSync(policy)
      worker.channel.vm = createSide()
      fs.readFileSync(later)
      givesNoTests(runner)
    })
    await runUnit(unit, worker)

    expect(readFinish(unit)).toMatchObject({
      reads: [unit.file, later],
      transforms: [policy],
    })
  })

  it('keeps a file a transformer read among the reads too when code outside the transformers read it, before or after', async () => {
    let first = path.join(directory, 'first.js')
    let later = path.join(directory, 'later.js')
    let worker = createWorker(runner => {
      worker.channel.vm = createSide()
      fs.existsSync(first)
      worker.calls.transformer += 1
      fs.existsSync(first)
      fs.existsSync(later)
      worker.calls.transformer -= 1
      fs.existsSync(later)
      givesNoTests(runner)
    })
    let unit = createUnit()
    await runUnit(unit, worker)

    expect(readFinish(unit)).toMatchObject({
      transforms: [first, later],
      reads: [first, later],
    })
  })

  it.each([
    ['a file under node_modules', 'node_modules/a/index.js'],
    ['a node_modules directory', 'node_modules'],
    ["mootant's own file", 'jest/plans/1/plan.js'],
    [
      'a node: name that a stack frame gave',
      'node:internal/modules/cjs/loader',
    ],
    ['a node: module name', 'node:fs.js'],
  ])(
    'leaves out %s, even under a directory of the session',
    async (_name, file) => {
      let worker = createWorker(
        runner => {
          worker.channel.vm = createSide()
          fs.existsSync(path.join(directory, file))
          fs.existsSync(path.join(directory, 'kept.js'))
          givesNoTests(runner)
        },
        { directory: path.join(directory, 'jest') },
      )
      let unit = createUnit()
      await runUnit(unit, worker)

      expect(readFinish(unit).reads).toStrictEqual([
        path.join(directory, 'kept.js'),
      ])
    },
  )

  it('lists the modules the own realm of the worker loaded that count, as one that loaded in an earlier unit is not read again', async () => {
    let helper = path.join(directory, 'transform-helper.js')
    let unit = createUnit()
    await runUnit(
      unit,
      createWorker(givesNoTests, {
        requireCache: {
          '/p/node_modules/jest-runner/build/index.js': {},
          [path.join(directory, 'jest/worker.cjs')]: {},
          '/elsewhere/notes.txt': {},
          [helper]: {},
        },
        directory: path.join(directory, 'jest'),
      }),
    )

    expect(readFinish(unit).loaded).toStrictEqual([helper])
  })

  it('says whether the reads hold every file read through node:fs', async () => {
    let unit = createUnit()
    await runUnit(unit, createWorker(givesNoTests, { tracked: false }))

    expect(readFinish(unit).tracked).toBe(false)
  })

  it('keeps what a console prints with no origin in a unit with a mutant and a console that keeps it, and puts its write back after the unit', async () => {
    let BufferedConsole = createConsoleClass()
    let { write } = BufferedConsole
    let buffers: object[][] = []
    let worker = createWorker(
      runner => {
        buffers.push(BufferedConsole.write([], 'log', 'printed'))
        givesNoTests(runner)
      },
      { BufferedConsole },
    )
    await runUnit(createUnit({ mutant: 'm' }), worker)
    await runUnit(createUnit(), worker)
    await runUnit(createUnit({ console: 'stream', mutant: 'm' }), worker)
    await runUnit(createUnit({ console: 'none', mutant: 'm' }), worker)
    let kept = { origin: 'at the call', message: 'printed', type: 'log' }

    expect(buffers).toStrictEqual([
      [{ message: 'printed', type: 'log', origin: '' }],
      [kept],
      [kept],
      [kept],
    ])
    expect(BufferedConsole.write).toBe(write)
  })

  it('stops the side and the read tracker, disables stores before the guard, and leaves only the exit guards once the guard waited', async () => {
    let order: string[] = []
    let guarded = path.join(directory, 'read-by-the-guard.txt')
    let side = createSide({
      stopTimers: () => {
        order.push('timers')
      },
      close: () => {
        order.push('close')
      },
    })
    let worker = createWorker(
      runner => {
        worker.channel.vm = side
        givesNoTests(runner)
      },
      {
        checkState: () => {
          fs.existsSync(guarded)
          order.push('guard')
          return Promise.resolve([])
        },
        Resolver: {
          clearDefaultResolverCache() {
            order.push('files')
          },
        },
        clearPerformance: () => {
          order.push('marks')
        },
        disableStores: () => {
          order.push('stores')
        },
      },
    )
    worker.process = {
      ...worker.process,
      removeAllListeners: event => {
        order.push(`remove ${event}`)
      },
      on: event => {
        order.push(`on ${event}`)
      },
    }
    let unit = createUnit()
    await runUnit(unit, worker)

    expect(readFinish(unit).reads).toStrictEqual([])
    expect(order).toStrictEqual([
      'timers',
      'close',
      'marks',
      'stores',
      'guard',
      'remove uncaughtException',
      'remove unhandledRejection',
      'remove rejectionHandled',
      'on uncaughtException',
      'on unhandledRejection',
      'files',
    ])
  })
})
