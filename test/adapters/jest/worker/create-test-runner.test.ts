import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { writeFile, readFile, mkdtemp, rm } from 'node:fs/promises'
import { AsyncLocalStorage } from 'node:async_hooks'
import { runInNewContext } from 'node:vm'
import { tmpdir } from 'node:os'
import path from 'node:path'

import type { WorkerChannel } from '../../../../adapters/jest/types/worker-channel'
import type { WorkerProject } from '../../../../adapters/jest/types/worker-project'
import type { WorkerCalls } from '../../../../adapters/jest/types/worker-calls'
import type { CircusEvent } from '../../../../adapters/jest/types/circus-event'
import type { CircusState } from '../../../../adapters/jest/types/circus-state'
import type { JestRecord } from '../../../../adapters/jest/types/jest-record'
import type { VmSide } from '../../../../adapters/jest/types/vm-side'

import { createWorkerChannel } from '../../../../adapters/jest/worker/create-worker-channel'
import { createTestRunner } from '../../../../adapters/jest/worker/create-test-runner'
import { createTestRuntime } from '../../../helpers/create-test-runtime'

/**
 * Key of what `expect` keeps on the global object of a vm.
 */
const MATCHERS_SLOT = Symbol.for('$$jest-matchers-object')

/**
 * Temporary directory of the current test.
 */
let directory = ''

/**
 * State with a test named `a`, as circus has it at `run_start`.
 */
let state: CircusState

/**
 * Test named `a`, as circus has it once it came to the test.
 */
let test: ReturnType<typeof createTest>

/**
 * A test environment with an optional handler of its own.
 */
interface FakeEnvironment {
  /**
   * Handler of the environment, then the wrapper's.
   */
  handleTestEvent?(event: CircusEvent, state: CircusState): unknown

  /**
   * Global object of the vm.
   */
  global: Record<symbol, unknown>
}

/**
 * Runs the wrapper as Jest would, with a real channel, and leaves the handler
 * in the environment.
 *
 * @param options - What differs from a dry unit.
 * @param options.environment - Environment of the test file.
 * @param options.mutant - Active mutant of the unit, or null.
 * @param options.dead - `Error` of the vm of each unit that ended.
 * @returns The channel, what the real test framework got and returned, and what
 *   the side and the wrapper were given.
 */
async function run(
  options: {
    environment?: FakeEnvironment
    mutant?: string | null
    dead?: WeakSet<object>
    opened?: boolean
  } = {},
): Promise<{
  windows: { framework?: true; after?: true; load?: true }
  requireOrImportModule: ReturnType<typeof vi.fn>
  real: ReturnType<typeof vi.fn>
  environment: FakeEnvironment
  channel: WorkerChannel
  parameters: unknown[]
  calls: WorkerCalls
  onStale(): void
  result: unknown
  side: VmSide
  out: string
}> {
  let environment = options.environment ?? { global: createGlobal() }
  let channel = createWorkerChannel()
  let out = path.join(directory, `${options.mutant ?? 'dry'}.jsonl`)
  channel.begin({
    mutant: options.mutant ?? null,
    file: '/a.test.js',
    console: 'buffer',
    project: 'p',
    plan: null,
    out,
  })
  let side: VmSide = {
    realmError: runInNewContext('Error') as ErrorConstructor,
    runtime: createTestRuntime(),
    listVariables: () => [],
    isReached: () => true,
    addVariable() {},
    stopTimers() {},
    close() {},
  }
  channel.vm = side
  let windows: { framework?: true; after?: true; load?: true } = {}
  let real = vi.fn(() => {
    windows.framework = calls.environment.getStore()
    return 'the result'
  })
  let requireOrImportModule = vi.fn(() => {
    windows.load = calls.environment.getStore()
    return Promise.resolve(real)
  })
  let onStale = vi.fn<() => void>()
  let projects = new Map<string, WorkerProject>([
    [
      'p',
      {
        config: { testRunner: '/jest-circus/runner.js' },
        configString: '{}',
      } as WorkerProject,
    ],
  ])
  let calls: WorkerCalls = {
    asyncTransformer: new AsyncLocalStorage<true>(),
    asyncResolver: new AsyncLocalStorage<true>(),
    environment: new AsyncLocalStorage<true>(),
    defaultResolver: 0,
    transformer: 0,
    unsettled: 0,
    resolver: 0,
  }
  let runner = createTestRunner({
    dead: options.dead ?? new WeakSet(),
    requireOrImportModule,
    projects,
    channel,
    onStale,
    calls,
  })
  let config = { testRunner: '/work/jest/test-runner.cjs', id: 'p' }
  let parameters: Parameters<typeof runner> = [
    { globalConfig: true },
    config,
    environment,
    { runtime: true },
    '/a.test.js',
    () => {},
  ]
  /**
   * Runs the wrapper as Jest calls it, and notes the store once it returned.
   *
   * @returns What the wrapper returned.
   */
  async function call(): Promise<unknown> {
    let returned = await runner(...parameters)
    windows.after = calls.environment.getStore()
    return returned
  }

  let result = await (options.opened === true ?
    calls.environment.run(true, call)
  : call())
  return {
    requireOrImportModule,
    environment,
    parameters,
    channel,
    windows,
    onStale,
    result,
    calls,
    real,
    side,
    out,
  }
}

/**
 * Creates the global object of a vm, with what `expect` holds there.
 *
 * @param fields - What the state of the snapshots holds in place of one entry
 *   of a snapshot file that does not exist.
 * @returns A global object with snapshots that would write their file.
 */
function createGlobal(fields: object = {}): Record<symbol, unknown> {
  return {
    [MATCHERS_SLOT]: {
      state: {
        snapshotState: {
          _snapshotPath: path.join(tmpdir(), 'mootant-no-such.snap'),
          save: () => ({ deleted: false, saved: true }),
          _snapshotData: { 'adds 1': '3' },
          _inlineSnapshots: [],
          _dirty: false,
          ...fields,
        },
      },
    },
  }
}

/**
 * Reads the records of an out file, without `time`.
 *
 * @param file - Path of the out file.
 * @returns Its records.
 */
async function readRecords(file: string): Promise<JestRecord[]> {
  let text = await readFile(file, 'utf8')
  return text
    .split('\n')
    .filter(line => line !== '')
    .map(line => {
      let { time, ...record } = JSON.parse(line) as {
        time: number
      } & JestRecord
      return record
    })
}

/**
 * Creates a test as circus keeps it.
 *
 * @param name - What `it` was given.
 * @returns A test with no errors.
 */
function createTest(name: string): {
  timeout: undefined | number
  errors: unknown[]
  type: 'test'
  name: string
} {
  return { timeout: undefined, type: 'test', errors: [], name }
}

describe('createTestRunner', () => {
  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'mootant-test-runner-'))
    test = createTest('a')
    state = {
      rootDescribeBlock: {
        name: 'ROOT_DESCRIBE_BLOCK',
        type: 'describeBlock',
        children: [test],
      },
      testTimeout: 5000,
    }
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    await rm(directory, { recursive: true, force: true })
  })

  it('loads the project framework of the plain project and calls it with the same parameters', async () => {
    let { requireOrImportModule, parameters, result, real } = await run()

    expect(requireOrImportModule).toHaveBeenCalledExactlyOnceWith(
      '/jest-circus/runner.js',
    )
    expect(real).toHaveBeenCalledExactlyOnceWith(...parameters)
    expect(result).toBe('the result')
  })

  it('tracks the events of a unit in the file of the unit', async () => {
    let { environment, channel, out } = await run()
    environment.handleTestEvent!({ name: 'run_start' }, state)
    environment.handleTestEvent!({ name: 'test_started', test }, state)
    environment.handleTestEvent!({ name: 'test_done', test }, state)
    channel.end()

    await expect(readRecords(out)).resolves.toStrictEqual([
      { kind: 'start' },
      { kind: 'load', covers: [], hits: 0 },
      { timeout: 5000, occurrence: 0, kind: 'open', name: 'a' },
      expect.objectContaining({ reached: true, kind: 'try', name: 'a' }),
    ])
  })

  it('tells a dry unit from one with a mutant', async () => {
    let dry = await run()
    dry.environment.handleTestEvent!(
      { hook: { type: 'afterAll', timeout: 1 }, name: 'hook_start' },
      state,
    )
    dry.channel.end()
    let unit = await run({ mutant: 'm' })
    unit.environment.handleTestEvent!(
      { hook: { type: 'afterAll', timeout: 1 }, name: 'hook_start' },
      state,
    )
    unit.channel.end()

    await expect(readRecords(dry.out)).resolves.toStrictEqual([
      { kind: 'start' },
      { kind: 'beat', timeout: 1 },
    ])
    await expect(readRecords(unit.out)).resolves.toStrictEqual([
      { kind: 'start' },
    ])
  })

  it('reads the realm of the unit and the dead ones', async () => {
    let DeadError = runInNewContext('Error') as ErrorConstructor
    let { environment, onStale, channel, side, out } = await run({
      dead: new WeakSet<object>([DeadError]),
    })
    let { realmError: CurrentError } = side
    environment.handleTestEvent!({ name: 'run_start' }, state)
    environment.handleTestEvent!({ name: 'test_started', test }, state)
    test.errors = [new CurrentError('current')]
    environment.handleTestEvent!({ name: 'test_done', test }, state)

    expect(onStale).not.toHaveBeenCalled()

    environment.handleTestEvent!(
      { error: new DeadError('late'), name: 'error' },
      state,
    )
    channel.end()

    expect(onStale).toHaveBeenCalledExactlyOnceWith()

    let records = await readRecords(out)

    expect(records.at(-2)).toMatchObject({ realm: 'current', kind: 'try' })
    expect(records.at(-1)).toStrictEqual({ message: 'late', kind: 'stale' })
  })

  it('measures with the clock of load time, whatever a test spies on later', async () => {
    let { environment, channel, out } = await run()
    environment.handleTestEvent!({ name: 'run_start' }, state)
    let now = vi.spyOn(Date, 'now').mockReturnValue(1)
    environment.handleTestEvent!({ name: 'test_started', test }, state)
    now.mockReturnValue(1e12)
    environment.handleTestEvent!({ name: 'test_done', test }, state)
    channel.end()

    expect(now).not.toHaveBeenCalled()

    let records = await readRecords(out)

    expect(records.at(-1)).toMatchObject({ kind: 'try' })
    expect(
      (records.at(-1) as { duration: number }).duration,
    ).toBeLessThanOrEqual(60_000)
  })

  it('calls the handler of the environment with its this and returns its result', async () => {
    let calls: unknown[][] = []
    let environment: FakeEnvironment = {
      handleTestEvent(event, eventState) {
        calls.push([this, event, eventState])
        return 'from the environment'
      },
      global: createGlobal(),
    }
    await run({ environment })
    let event: CircusEvent = { name: 'run_start' }

    expect(environment.handleTestEvent!(event, state)).toBe(
      'from the environment',
    )
    expect(calls).toStrictEqual([[environment, event, state]])
  })

  it('returns nothing from an environment with no handler of its own', async () => {
    let { environment } = await run()

    expect(
      environment.handleTestEvent!({ name: 'run_start' }, state),
    ).toBeUndefined()
  })

  it('loads the real test framework in the store of the environment once the last setup file entered it, runs the framework out of it and goes on in it', async () => {
    let entered = await run({ opened: true })
    let plain = await run()

    expect(entered.windows).toStrictEqual({
      framework: undefined,
      after: true,
      load: true,
    })
    expect(plain.windows).toStrictEqual({
      framework: undefined,
      after: undefined,
      load: undefined,
    })
  })

  it('calls the handler of the environment inside the store of its calls, which what it goes on with keeps and the caller does not', async () => {
    let seen: (undefined | true)[] = []
    let environment: FakeEnvironment = {
      async handleTestEvent() {
        seen.push(calls.environment.getStore())
        await Promise.resolve()
        seen.push(calls.environment.getStore())
      },
      global: createGlobal(),
    }
    let { calls } = await run({ environment })
    let pending = environment.handleTestEvent!({ name: 'run_start' }, state)
    seen.push(calls.environment.getStore())
    await pending

    expect(seen).toStrictEqual([true, undefined, true])
  })

  it('leaves the store of the environment off when the environment has no handler of its own', async () => {
    let { environment, calls } = await run()
    let enter = vi.spyOn(calls.environment, 'run')
    environment.handleTestEvent!({ name: 'run_start' }, state)

    expect(enter).not.toHaveBeenCalled()
  })

  it('writes a tracker error, keeps it from the caller and still calls the handler of the environment', async () => {
    let calls: unknown[] = []
    let environment: FakeEnvironment = {
      handleTestEvent() {
        calls.push(this)
        return 'still called'
      },
      global: createGlobal(),
    }
    let { channel, out } = await run({ environment })

    expect(
      environment.handleTestEvent!({ name: 'test_done', test }, state),
    ).toBe('still called')
    expect(calls).toStrictEqual([environment])

    channel.end()
    let records = await readRecords(out)

    expect(records.at(-1)).toStrictEqual({
      message: expect.any(String) as string,
      kind: 'tracker-error',
      event: 'test_done',
    })
  })

  it('lets a throw of the handler of the environment reach the caller, as no error of the tracker', async () => {
    let error = new Error('from the environment')
    let calls = 0
    let environment: FakeEnvironment = {
      handleTestEvent() {
        calls += 1
        throw error
      },
      global: createGlobal(),
    }
    let { channel, out } = await run({ environment })

    expect(() => {
      environment.handleTestEvent!({ name: 'run_start' }, state)
    }).toThrow(error)
    expect(calls).toBe(1)

    channel.end()
    let records = await readRecords(out)

    expect(records.map(record => record.kind)).toStrictEqual(['start', 'load'])
  })

  it('reads the tests on run_finish once the handler of the environment settled, which may give one an error', async () => {
    let environment: FakeEnvironment = {
      async handleTestEvent(event) {
        await Promise.resolve()
        if (event.name === 'run_finish') {
          test.errors.push(new Error('given at the end'))
        }
        return 'settled'
      },
      global: createGlobal(),
    }
    let { channel, out } = await run({ environment })
    await environment.handleTestEvent!({ name: 'run_start' }, state)
    await environment.handleTestEvent!({ name: 'test_started', test }, state)
    await environment.handleTestEvent!({ name: 'test_done', test }, state)

    await expect(
      environment.handleTestEvent!({ name: 'run_finish' }, state),
    ).resolves.toBe('settled')

    channel.end()
    let records = await readRecords(out)

    expect(records.at(-1)).toStrictEqual(
      expect.objectContaining({
        message: 'given at the end',
        covers: null,
        failed: true,
        kind: 'try',
        name: 'a',
      }),
    )
  })

  it('reads the tests on run_finish when the handler of the environment throws, and lets the throw through', async () => {
    let error = new Error('from the environment')
    let environment: FakeEnvironment = {
      handleTestEvent(event) {
        if (event.name === 'run_finish') {
          test.errors.push(error)
          throw error
        }
      },
      global: createGlobal(),
    }
    let { channel, out } = await run({ environment })
    environment.handleTestEvent!({ name: 'run_start' }, state)
    environment.handleTestEvent!({ name: 'test_started', test }, state)
    environment.handleTestEvent!({ name: 'test_done', test }, state)

    await expect(
      environment.handleTestEvent!({ name: 'run_finish' }, state),
    ).rejects.toThrow(error)

    channel.end()
    let records = await readRecords(out)

    expect(records.at(-1)).toStrictEqual(
      expect.objectContaining({
        message: 'from the environment',
        failed: true,
        kind: 'try',
      }),
    )
  })

  it('reads the tests on run_finish in an environment with no handler of its own', async () => {
    let { environment, channel, out } = await run()
    environment.handleTestEvent!({ name: 'run_start' }, state)
    environment.handleTestEvent!({ name: 'test_started', test }, state)
    environment.handleTestEvent!({ name: 'test_done', test }, state)
    test.errors.push(new Error('after its test_done'))
    await environment.handleTestEvent!({ name: 'run_finish' }, state)
    channel.end()
    let records = await readRecords(out)

    expect(records.at(-1)).toStrictEqual(
      expect.objectContaining({
        message: 'after its test_done',
        failed: true,
        kind: 'try',
      }),
    )
  })

  it('keeps Jest from writing the snapshot file from the start of the tests', async () => {
    let global = createGlobal()
    let { snapshotState } = (
      global[MATCHERS_SLOT] as {
        state: { snapshotState: { save(): object } }
      }
    ).state
    let { environment, channel, out } = await run({ environment: { global } })

    expect(snapshotState.save()).toStrictEqual({ deleted: false, saved: true })

    environment.handleTestEvent!({ name: 'run_start' }, state)
    channel.end()

    expect(snapshotState.save()).toStrictEqual({ deleted: false, saved: false })
    await expect(readRecords(out)).resolves.toMatchObject([
      { kind: 'start' },
      { kind: 'load' },
    ])
  })

  it.each<[string, object, boolean]>([
    ['with no entry, which Jest calls obsolete', {}, true],
    ['with an entry', { _snapshotData: { 'adds 1': '3' } }, false],
    [
      'with no entry and inline snapshots to write',
      { _inlineSnapshots: [{}], _dirty: true },
      false,
    ],
  ])(
    'says a snapshot file that exists %s is to be deleted as Jest does, and leaves it',
    async (_name, fields, deleted) => {
      let file = path.join(
        await mkdtemp(path.join(tmpdir(), 'mootant-snap-')),
        'a.snap',
      )
      await writeFile(file, 'header')
      let global = createGlobal({
        _snapshotPath: file,
        _snapshotData: {},
        ...fields,
      })
      let { snapshotState } = (
        global[MATCHERS_SLOT] as {
          state: { snapshotState: { save(): object } }
        }
      ).state
      let { environment, channel } = await run({ environment: { global } })
      environment.handleTestEvent!({ name: 'run_start' }, state)
      channel.end()

      expect(snapshotState.save()).toStrictEqual({ saved: false, deleted })
      await expect(readFile(file, 'utf8')).resolves.toBe('header')
      await rm(path.dirname(file), { recursive: true, force: true })
    },
  )

  it('drops a record written after the channel moved to another unit', async () => {
    let { environment, channel, out } = await run()
    channel.end()
    let next = path.join(directory, 'b.jsonl')
    channel.begin({
      file: '/b.test.js',
      console: 'buffer',
      project: 'p',
      mutant: null,
      plan: null,
      out: next,
    })
    environment.handleTestEvent!({ concurrent: true, name: 'add_test' }, state)
    channel.end()

    await expect(readRecords(out)).resolves.toStrictEqual([{ kind: 'start' }])
    await expect(readRecords(next)).resolves.toStrictEqual([{ kind: 'start' }])
  })
})
