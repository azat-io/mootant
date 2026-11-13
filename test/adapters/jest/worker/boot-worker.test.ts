import { writeFile, realpath, mkdtemp, mkdir, rm } from 'node:fs/promises'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { AsyncLocalStorage, AsyncResource } from 'node:async_hooks'
import { stripTypeScriptTypes, createRequire } from 'node:module'
import { setFlagsFromString } from 'node:v8'
import { realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import type { WorkerProcess } from '../../../../adapters/jest/types/worker-process'
import type { WorkerChannel } from '../../../../adapters/jest/types/worker-channel'
import type { UnitWorker } from '../../../../adapters/jest/types/unit-worker'
import type { JestUnit } from '../../../../adapters/jest/types/jest-unit'

import { createTransformerFactory } from '../../../../adapters/jest/worker/create-transformer-factory'
import { createTestRunner } from '../../../../adapters/jest/worker/create-test-runner'
import { trackFileReads } from '../../../../adapters/shared/track-file-reads'
import { CHANNEL_SLOT } from '../../../../adapters/jest/worker/channel-slot'
import { trackSpawners } from '../../../../adapters/shared/track-spawners'
import { bootWorker } from '../../../../adapters/jest/worker/boot-worker'
import { createTestRuntime } from '../../../helpers/create-test-runtime'
import { runUnit } from '../../../../adapters/jest/worker/run-unit'

vi.mock(import('../../../../adapters/shared/track-file-reads'), () => ({
  trackFileReads: vi.fn<() => void>(),
}))

vi.mock(import('../../../../adapters/shared/track-spawners'), () => ({
  trackSpawners: vi.fn(() => false),
}))

vi.mock(import('../../../../adapters/jest/worker/run-unit'), () => ({
  runUnit: vi.fn(),
}))

vi.mock(import('node:v8'), async importOriginal => {
  let actual = await importOriginal()
  return { ...actual, setFlagsFromString: vi.fn<() => void>() }
})

vi.mock(
  import('../../../../adapters/jest/worker/create-test-runner'),
  async importOriginal => {
    let actual = await importOriginal()
    return { createTestRunner: vi.fn(actual.createTestRunner) }
  },
)

vi.mock(
  import('../../../../adapters/jest/worker/create-transformer-factory'),
  async importOriginal => {
    let actual = await importOriginal()
    return { createTransformerFactory: vi.fn(actual.createTransformerFactory) }
  },
)

/**
 * Key of what the tiny packages reach on the global object of this process.
 */
const SHARED = Symbol.for('mootant.test.boot')

/**
 * Key of what the worker sets on its global object.
 */
const WORKER_SLOT = Symbol.for('mootant.worker')

/**
 * A unit of these tests.
 */
const UNIT: JestUnit = {
  file: '/a.test.js',
  console: 'buffer',
  out: '/a.jsonl',
  project: 'p',
  mutant: null,
  plan: null,
}

/**
 * Temporary directory of the current test.
 */
let directory = ''

/**
 * What happened in the current test, in order.
 */
let log: string[] = []

/**
 * Environment of the fake process when each package loaded.
 */
let seen: Record<string, unknown>[] = []

/**
 * What a test reads of a booted worker.
 */
interface Booted {
  /**
   * Listeners of the fake process by event.
   */
  listeners: Map<string, ((value: unknown) => void)[]>

  /**
   * Callbacks of `send`, in order.
   */
  callbacks: ((error: Error | null) => void)[]

  /**
   * The global object of the worker.
   */
  global: Record<string | symbol, unknown>

  /**
   * Environment of the fake process.
   */
  env: Record<string, undefined | string>

  /**
   * The fake process.
   */
  target: WorkerProcess

  /**
   * What the worker wrote to standard error.
   */
  errors: string[]

  /**
   * Messages the worker sent.
   */
  sent: unknown[]

  /**
   * Codes the worker exited with.
   */
  exits: number[]

  /**
   * The fake `AsyncLocalStorage.prototype`.
   */
  stores: object
}

/**
 * Message a worker sends when a unit ended.
 */
interface Done {
  /**
   * Whether the worker ends once the message is out.
   */
  last: boolean

  /**
   * Kind of the message.
   */
  type: 'done'
}

/**
 * Boots a worker on a fake process and fake packages.
 *
 * @param options - What differs from a worker with no heap flag.
 * @param options.timeline - The `performance` of its global object.
 * @param options.heapFlag - The flag mootant added, in the variable and in the
 *   Node flags, which also hold `--stack-size=500`.
 * @param options.nodeFlags - More Node flags of the command.
 * @param options.nodeOptions - `NODE_OPTIONS` of the worker.
 * @param options.stripsTypes - Whether the Jest of the session strips types.
 * @param options.stripTypes - What Node gives to strip types.
 * @returns What a test reads of it.
 */
async function boot(
  options: {
    timeline?: Pick<Performance, 'clearMeasures' | 'clearMarks'>
    stripTypes?: Parameters<typeof bootWorker>[0]['stripTypes']
    defaultResolver?: boolean
    stripsTypes?: boolean
    nodeOptions?: string
    nodeFlags?: string[]
    heapFlag?: string
  } = {},
): Promise<Booted> {
  let {
    timeline = { clearMeasures() {}, clearMarks() {} },
    defaultResolver = false,
    stripsTypes = true,
    nodeFlags = [],
    nodeOptions,
    heapFlag,
  } = options
  let stripTypes =
    'stripTypes' in options ? options.stripTypes : stripTypeScriptTypes
  let session = await writeSession(stripsTypes, defaultResolver)
  let env: Record<string, undefined | string> = {
    ...(heapFlag !== undefined && { MOOTANT_HEAP_FLAG: heapFlag }),
    ...(nodeOptions !== undefined && { NODE_OPTIONS: nodeOptions }),
    MOOTANT_SESSION: session,
    MOOTANT_SLOT: '3',
    OWN: 'kept',
  }
  Reflect.set(globalThis, SHARED, { seen, env, log })
  let listeners = new Map<string, ((value: unknown) => void)[]>()
  let callbacks: ((error: Error | null) => void)[] = []
  let errors: string[] = []
  let exits: number[] = []
  let sent: unknown[] = []
  let mask = 0o022
  let target: WorkerProcess = {
    send(message, callback) {
      log.push(`send ${(message as { type: string }).type}`)
      sent.push(message)
      if (callback) {
        callbacks.push(callback)
      }
      return true
    },
    env: new Proxy(env, {
      get(object, name) {
        log.push(`read ${String(name)}`)
        return Reflect.get(object, name) as unknown
      },
    }),
    on(event, listener) {
      log.push(`on ${event}`)
      listeners.set(event, [...(listeners.get(event) ?? []), listener])
    },
    execArgv: [
      '--stack-size=500',
      ...nodeFlags,
      ...(heapFlag === undefined ? [] : [heapFlag]),
    ],
    umask(next) {
      let previous = mask
      mask = next ?? mask
      return previous
    },
    stderr: {
      write(text) {
        errors.push(text)
      },
    },
    removeAllListeners(event) {
      listeners.delete(event)
    },
    cwd() {
      log.push('read cwd')
      return '/'
    },
    getBuiltinModule: name => process.getBuiltinModule(name),
    exit(code) {
      exits.push(code)
    },
    getActiveResourcesInfo: () => [],
    stdout: {},
  }
  let global: {
    performance: Pick<Performance, 'clearMeasures' | 'clearMarks'>
  } & Record<string | symbol, unknown> = { performance: timeline }
  let stores = { _enable() {} }
  bootWorker({ process: target, stripTypes, global, stores })
  return {
    callbacks,
    listeners,
    target,
    errors,
    global,
    stores,
    exits,
    sent,
    env,
  }
}

/**
 * Writes tiny Jest packages and the session of the current test.
 *
 * @param stripsTypes - Whether the Jest of the session strips types.
 * @param defaultResolver - Whether `jest-resolve` has the module of its default
 *   resolver apart, as Jest 29.7 has.
 * @returns Absolute path of `session.json`.
 */
async function writeSession(
  stripsTypes: boolean,
  defaultResolver: boolean,
): Promise<string> {
  let packages: Record<string, string> = {
    runtime: `exports.default = {
      createResolver(config, moduleMap) {
        globalThis[Symbol.for('mootant.test.boot')].log.push('createResolver')
        return {
          resolver: config.id,
          moduleMap,
          check(read) {
            return read()
          },
        }
      },
    }`,
    console: `exports.getConsoleOutput = () => 'what tests printed'
      exports.BufferedConsole = class BufferedConsole {
        static write(buffer) {
          return buffer
        }
      }`,
    resolve: `exports.default = class Resolver {
      static clearDefaultResolverCache() {
        globalThis[Symbol.for('mootant.test.boot')].log.push('clear files')
      }
    }`,
    hasteMap: `exports.default = {
      getStatic: config => ({
        getModuleMapFromJSON: json => ({ map: json, of: config.id }),
      }),
    }`,
    util: `exports.requireOrImportModule = async file => file`,
    runner: `exports.default = class TestRunner {}`,
  }
  await Promise.all(
    Object.entries(packages).map(async ([name, code]) => {
      await mkdir(path.join(directory, name))
      await writeFile(
        path.join(directory, name, 'index.js'),
        `let shared = globalThis[Symbol.for('mootant.test.boot')]
        shared.log.push('load ${name}')
        shared.seen.push({ ...shared.env })
        ${code}`,
      )
    }),
  )
  if (defaultResolver) {
    await mkdir(path.join(directory, 'resolve/build'))
    await writeFile(
      path.join(directory, 'resolve/build/defaultResolver.js'),
      'exports.default = read => read()\n',
    )
  }
  let file = path.join(directory, 'session.json')
  await writeFile(
    file,
    JSON.stringify({
      packages: {
        hasteMap: path.join(directory, 'hasteMap'),
        console: path.join(directory, 'console'),
        resolve: path.join(directory, 'resolve'),
        runtime: path.join(directory, 'runtime'),
        runner: path.join(directory, 'runner'),
        util: path.join(directory, 'util'),
        stripsTypes,
      },
      projects: [
        {
          config: { transform: [], id: 'p' },
          moduleMap: { rootDir: '/p' },
          id: 'p',
        },
      ],
      reads: { extensions: ['js', 'snap'], directories: ['/p'] },
      globalConfig: { maxWorkers: 2 },
      umask: 0o027,
    }),
  )
  return file
}

/**
 * Delivers a unit and reads what it got as the worker.
 *
 * @param booted - Worker that gets it.
 * @returns The second argument of `runUnit`.
 */
async function readWorker(booted: Booted): Promise<UnitWorker> {
  deliver(booted)
  await vi.waitFor(() => {
    expect(vi.mocked(runUnit).mock.calls).toHaveLength(1)
  })
  return vi.mocked(runUnit).mock.calls[0]![1]
}

/**
 * Delivers a unit the way main does.
 *
 * @param booted - Worker that gets it.
 */
function deliver(booted: Booted): void {
  booted.listeners.get('message')![0]!({ type: 'unit', unit: UNIT })
}

describe('bootWorker', () => {
  beforeEach(async () => {
    directory = await realpath(
      await mkdtemp(path.join(tmpdir(), 'mootant-boot-')),
    )
    log = []
    seen = []
    vi.mocked(trackFileReads).mockImplementation(receiver => {
      log.push(receiver === null ? 'stop reads' : 'track reads')
    })
    vi.mocked(runUnit).mockResolvedValue(false)
  })

  afterEach(async () => {
    vi.mocked(createTransformerFactory).mockClear()
    vi.mocked(setFlagsFromString).mockClear()
    vi.mocked(createTestRunner).mockClear()
    vi.mocked(runUnit).mockReset()
    /* Cspell:disable-next-line */
    vi.unstubAllEnvs()
    Reflect.deleteProperty(globalThis, SHARED)
    await rm(directory, { recursive: true, force: true })
  })

  it('starts the read tracker with no receiver before anything else', async () => {
    await boot()

    expect(log[0]).toBe('stop reads')
    expect(log[1]).toBe('read MOOTANT_HEAP_FLAG')
  })

  describe('with a heap flag', () => {
    it('takes the flag out of the Node flags and of the environment, and leaves the others', async () => {
      let { target, env } = await boot({
        heapFlag: '--max-old-space-size=512',
      })

      expect(target.execArgv).toStrictEqual(['--stack-size=500'])
      expect(env).toStrictEqual({ OWN: 'kept' })
    })

    it('resets the limit for new isolates once, right after the read tracker', async () => {
      vi.mocked(setFlagsFromString).mockImplementation(() => {
        log.push('reset limit')
      })
      await boot({ heapFlag: '--max-old-space-size=512' })

      expect(setFlagsFromString).toHaveBeenCalledExactlyOnceWith(
        '--max-old-space-size=0',
      )
      expect(log.slice(0, 3)).toStrictEqual([
        'stop reads',
        'read MOOTANT_HEAP_FLAG',
        'reset limit',
      ])
    })

    it('has reset everything before any package loads', async () => {
      await boot({ heapFlag: '--max-old-space-size=512' })

      expect(seen).toHaveLength(6)
      expect(seen.every(entry => !('MOOTANT_HEAP_FLAG' in entry))).toBe(true)
    })
  })

  it('changes nothing with no heap flag', async () => {
    let { target } = await boot()

    expect(target.execArgv).toStrictEqual(['--stack-size=500'])
    expect(setFlagsFromString).not.toHaveBeenCalled()
  })

  it('reads and deletes its two variables before any package loads', async () => {
    let { env } = await boot()

    expect(seen).toHaveLength(6)
    expect(seen.every(entry => !('MOOTANT_SESSION' in entry))).toBe(true)
    expect(seen.every(entry => !('MOOTANT_SLOT' in entry))).toBe(true)
    expect(seen.every(entry => entry['OWN'] === 'kept')).toBe(true)
    expect(env).toStrictEqual({ OWN: 'kept' })
  })

  it('loads the packages by absolute path and makes a resolver at boot, before the guards', async () => {
    let booted = await boot()
    let worker = await readWorker(booted)

    expect(log.slice(3, 10)).toStrictEqual([
      'read MOOTANT_SLOT',
      'load runner',
      'load runtime',
      'load hasteMap',
      'load util',
      'load resolve',
      'load console',
    ])
    expect(log.slice(0, log.indexOf('on uncaughtException'))).toContain(
      'createResolver',
    )
    expect(worker.projects.get('p')).toStrictEqual({
      resolver: expect.objectContaining({
        moduleMap: { map: { rootDir: '/p' }, of: 'p' },
        resolver: 'p',
      }) as unknown,
      configString: JSON.stringify({ transform: [], id: 'p' }),
      moduleMap: { map: { rootDir: '/p' }, of: 'p' },
      config: { transform: [], id: 'p' },
      wrapped: new Map(),
    })
    expect(worker.globalConfig).toStrictEqual({ maxWorkers: 2 })
    expect(worker.calls).toStrictEqual({
      asyncTransformer: expect.any(AsyncLocalStorage) as unknown,
      asyncResolver: expect.any(AsyncLocalStorage) as unknown,
      environment: expect.any(AsyncLocalStorage) as unknown,
      defaultResolver: 0,
      transformer: 0,
      unsettled: 0,
      resolver: 0,
    })
    expect(worker.flags).toStrictEqual({ stale: false })
    expect(worker.directory).toBe(directory)
    expect(worker.process).toBe(booted.target)
    expect(worker.slot).toBe('3')
    expect(worker.TestRunner.name).toBe('TestRunner')
    expect(worker.getConsoleOutput([], {}, {})).toBe('what tests printed')
  })

  it('hands the units what their reads count, from the session, and the console class of the console package', async () => {
    let worker = await readWorker(await boot())
    let { BufferedConsole } = createRequire(import.meta.url)(
      path.join(directory, 'console'),
    ) as Pick<UnitWorker, 'BufferedConsole'>

    expect(worker.reads).toStrictEqual({
      temporary: [tmpdir(), realpathSync(tmpdir())],
      extensions: new Set(['snap', 'js']),
      directories: ['/p'],
    })
    expect(worker.BufferedConsole).toBe(BufferedConsole)
    expect(worker.requireCache).toBe(createRequire(import.meta.url).cache)
    expect(worker.tracked).toBe(true)
    expect(worker.early).toBe(false)
  })

  it('says every unit gets all variables when a promisified execFile was made before the worker wrapped what starts a process', async () => {
    vi.mocked(trackSpawners).mockReturnValueOnce(true)
    let worker = await readWorker(await boot())

    expect(worker.early).toBe(true)
  })

  it('takes a temporary directory that is missing only as Node gives it', async () => {
    let missing = path.join(directory, 'missing')
    vi.stubEnv('TMPDIR', missing)
    let worker = await readWorker(await boot())

    expect(worker.reads.temporary).toStrictEqual([missing])
  })

  it("counts the calls of each project's resolver, in the count the units and the transformers share", async () => {
    let worker = await readWorker(await boot())
    let resolver = worker.projects.get('p')!.resolver as {
      check(read: () => number): number
    }
    let [input] = vi.mocked(createTransformerFactory).mock.calls[0]!

    expect(resolver.check(() => worker.calls.resolver)).toBe(1)
    expect(worker.calls).toStrictEqual({
      asyncTransformer: expect.any(AsyncLocalStorage) as unknown,
      asyncResolver: expect.any(AsyncLocalStorage) as unknown,
      environment: expect.any(AsyncLocalStorage) as unknown,
      defaultResolver: 0,
      transformer: 0,
      unsettled: 0,
      resolver: 0,
    })
    expect(input.calls).toBe(worker.calls)
  })

  it.each([
    [true, 1],
    [false, undefined],
  ])(
    "counts the calls of Jest 29.7's default resolver, which a project's own resolver hands requests to, when jest-resolve has it apart: %s",
    async (apart, during) => {
      let worker = await readWorker(await boot({ defaultResolver: apart }))
      let file = path.join(directory, 'resolve/build/defaultResolver.js')

      /**
       * Reads the count of the calls of the default resolver.
       *
       * @returns The count now.
       */
      function read(): number {
        return worker.calls.defaultResolver
      }

      expect(
        apart ?
          (
            createRequire(file)(file) as {
              default(check: () => number, options: object): number
            }
          ).default(read, {})
        : undefined,
      ).toBe(during)
      expect(worker.calls.defaultResolver).toBe(0)
    },
  )

  it('says the reads of units miss what graceful-fs reads when it loaded before the worker', async () => {
    let file = path.join(directory, 'node_modules/graceful-fs/graceful-fs.js')
    await mkdir(path.dirname(file), { recursive: true })
    await writeFile(file, 'module.exports = {}')
    let load = createRequire(file)
    load(file)
    try {
      let worker = await readWorker(await boot())

      expect(worker.tracked).toBe(false)
    } finally {
      Reflect.deleteProperty(load.cache, file)
    }
  })

  it.each([
    [
      'strips the types of a file no transformer claims with a Jest that strips them, on a Node that can',
      {},
      'let a         = 1',
    ],
    [
      'keeps the types with a Jest that does not strip them',
      { stripsTypes: false },
      'let a: number = 1',
    ],
    [
      'keeps the types on a Node that cannot strip them',
      { stripTypes: undefined, stripsTypes: true },
      'let a: number = 1',
    ],
  ])('%s', async (_name, options, code) => {
    let booted = await boot(options)
    let { transformer } = booted.global[WORKER_SLOT] as {
      transformer: {
        createTransformer(config: object): Promise<{
          process(source: string, file: string, options: object): unknown
        }>
      }
    }
    let identity = await transformer.createTransformer({
      real: null,
      plan: null,
    })

    expect(
      identity.process('let a: number = 1', '/a.ts', {
        transformerConfig: undefined,
        config: { id: 'p' },
        instrument: false,
        configString: '',
      }),
    ).toStrictEqual({ code })
  })

  it('puts the channel on the process and hands it to the units', async () => {
    let booted = await boot()
    let channel = Reflect.get(booted.target, CHANNEL_SLOT) as WorkerChannel
    let worker = await readWorker(booted)

    expect(channel).toMatchObject({ unit: null, token: 0, vm: null })
    expect(worker.channel).toBe(channel)
  })

  it('enters the store of the test environment when the last setup file asks, for what runs after it', async () => {
    let booted = await boot()
    let channel = Reflect.get(booted.target, CHANNEL_SLOT) as WorkerChannel
    let { calls } = await readWorker(booted)
    let unit = new AsyncResource('unit')
    let stores = await unit.runInAsyncScope(async () => {
      let before = calls.environment.getStore()
      channel.enterEnvironment()
      await Promise.resolve()
      return [before, calls.environment.getStore()]
    })

    expect(stores).toStrictEqual([undefined, true])
    expect(calls.environment.getStore()).toBeUndefined()
  })

  it('makes a child process that gets the variables of the worker add * to those of the current unit, unless a transformer or the test environment starts it', async () => {
    vi.mocked(trackSpawners).mockClear()
    let booted = await boot()
    let channel = Reflect.get(booted.target, CHANNEL_SLOT) as WorkerChannel
    let { calls } = await readWorker(booted)
    let [[real, record]] = vi.mocked(trackSpawners).mock.calls as [
      [object, (name: string) => void],
    ]
    record('*')
    let addVariable = vi.fn<(name: string) => void>()
    channel.vm = {
      runtime: createTestRuntime({ hitLimit: 0 }),
      listVariables: () => [],
      isReached: () => false,
      realmError: Error,
      stopTimers() {},
      addVariable,
      close() {},
    }
    record('*')
    calls.transformer = 1
    record('*')
    calls.transformer = 0
    calls.asyncTransformer.run(true, () => {
      record('*')
    })
    calls.environment.run(true, () => {
      record('*')
    })

    expect(real).toBe(booted.target.env)
    expect(addVariable).toHaveBeenCalledExactlyOnceWith('*')
  })

  it('sets what the constant modules export, shares its state with the tracker, and a stale event sets the flag', async () => {
    let booted = await boot()
    let made = booted.global[WORKER_SLOT] as {
      transformer: { createTransformer: unknown }
      testRunner: unknown
    }

    expect(made.testRunner).toBeTypeOf('function')
    expect(made.transformer.createTransformer).toBeTypeOf('function')

    let worker = await readWorker(booted)
    let [input] = vi.mocked(createTestRunner).mock.calls[0]!
    input.onStale()

    expect(worker.flags.stale).toBe(true)
    expect(input.projects).toBe(worker.projects)
    expect(input.channel).toBe(worker.channel)
    expect(input.calls).toBe(worker.calls)
    expect(input.dead).toBe(worker.dead)
  })

  it('makes the outer runtime an inert stub that records what ran there', async () => {
    let booted = await boot()
    let stub = booted.global['__mootant'] as {
      hitAny(ids: readonly string[]): boolean
      hit(id: string): boolean
    }

    expect(stub.hit('outside-1')).toBe(false)
    expect(stub.hitAny(['outside-2', 'outside-3'])).toBe(false)

    let worker = await readWorker(booted)

    expect([...worker.outside]).toStrictEqual([
      'outside-1',
      'outside-2',
      'outside-3',
    ])
  })

  it('tracks the stores of the given prototype', async () => {
    let booted = await boot()
    let worker = await readWorker(booted)
    let store = { disable: vi.fn<() => void>() }
    Reflect.apply(
      Reflect.get(booted.stores, '_enable') as () => void,
      store,
      [],
    )
    worker.disableStores()

    expect(store.disable).toHaveBeenCalledExactlyOnceWith()
  })

  it('hands the units the file cache of jest-resolve', async () => {
    let worker = await readWorker(await boot())

    expect(log).not.toContain('clear files')

    worker.Resolver.clearDefaultResolverCache()

    expect(log).toContain('clear files')
  })

  it('clears marks and measures with what performance had at boot, so what a test puts there sees nothing', async () => {
    let clearMeasures = vi.fn<() => void>()
    let clearMarks = vi.fn<() => void>()
    let timeline = { clearMeasures, clearMarks }
    let worker = await readWorker(await boot({ timeline }))
    let spy = vi.fn<() => void>()
    timeline.clearMeasures = spy
    timeline.clearMarks = spy
    worker.clearPerformance()

    expect(clearMarks).toHaveBeenCalledExactlyOnceWith()
    expect(clearMeasures).toHaveBeenCalledExactlyOnceWith()
    expect(spy).not.toHaveBeenCalled()
  })

  it('clears the marks and measures of the real performance, past a spy of a test', async () => {
    let worker = await readWorker(await boot({ timeline: performance }))
    let marks = vi.spyOn(performance, 'clearMarks')
    let measures = vi.spyOn(performance, 'clearMeasures')
    try {
      performance.mark('left by a test')
      performance.measure('measured by a test', 'left by a test')
      worker.clearPerformance()

      expect(performance.getEntriesByName('left by a test')).toStrictEqual([])
      expect(performance.getEntriesByName('measured by a test')).toStrictEqual(
        [],
      )
      expect(marks).not.toHaveBeenCalled()
      expect(measures).not.toHaveBeenCalled()
    } finally {
      marks.mockRestore()
      measures.mockRestore()
    }
  })

  it('makes the guard after the listeners and before ready', async () => {
    let booted = await boot()
    let order = log.filter(entry =>
      [
        'on unhandledRejection',
        'on uncaughtException',
        'on disconnect',
        'send ready',
        'on message',
        'read cwd',
      ].includes(entry),
    )

    expect(order).toStrictEqual([
      'on uncaughtException',
      'on unhandledRejection',
      'on message',
      'on disconnect',
      'read cwd',
      'send ready',
    ])
    expect(booted.sent).toStrictEqual([{ type: 'ready' }])
    expect(booted.callbacks).toStrictEqual([])
  })

  it('takes the mask global setup left, which is what the guard holds it to', async () => {
    let booted = await boot()
    let worker = await readWorker(booted)

    expect(booted.target.umask()).toBe(0o027)
    await expect(worker.checkState()).resolves.toStrictEqual([])
  })

  it('compares with the guard made at boot', async () => {
    let booted = await boot()
    let worker = await readWorker(booted)

    await expect(worker.checkState()).resolves.toStrictEqual([])

    booted.target.cwd = () => '/elsewhere'
    booted.target.umask = () => 0o077

    await expect(worker.checkState()).resolves.toStrictEqual(['cwd', 'umask'])
  })

  it('says a unit ended and keeps running without last', async () => {
    let booted = await boot()
    deliver(booted)
    await vi.waitFor(() => {
      expect(booted.sent).toHaveLength(2)
    })

    expect(vi.mocked(runUnit).mock.calls[0]![0]).toBe(UNIT)
    expect(booted.sent[1]).toStrictEqual({ type: 'done', last: false })

    booted.callbacks[0]!(null)

    expect(booted.exits).toStrictEqual([])
  })

  it('exits with last only once the message is out', async () => {
    vi.mocked(runUnit).mockResolvedValue(true)
    let booted = await boot()
    deliver(booted)
    await vi.waitFor(() => {
      expect(booted.sent).toHaveLength(2)
    })

    expect(booted.sent[1]).toStrictEqual({ type: 'done', last: true })
    expect(booted.exits).toStrictEqual([])

    booted.callbacks[0]!(null)

    expect(booted.exits).toStrictEqual([0])
  })

  describe('with vm modules', () => {
    /**
     * Delivers units one at a time, each once the last one said it ended.
     *
     * @param booted - Worker that gets them.
     * @param count - Number of units.
     * @returns What each `done` said of `last`, in order.
     */
    async function runUnits(booted: Booted, count: number): Promise<unknown[]> {
      await Array.from({ length: count }).reduce<Promise<void>>(
        async (previous, _unit, index) => {
          await previous
          deliver(booted)
          await vi.waitFor(
            () => {
              expect(booted.sent).toHaveLength(index + 2)
            },
            { interval: 1 },
          )
        },
        Promise.resolve(),
      )
      return booted.sent.slice(1).map(message => (message as Done).last)
    }

    it.each([
      {
        options: { nodeFlags: ['--experimental-vm-modules'] },
        name: 'the flag in the command',
      },
      {
        options: {
          nodeOptions: '--max-old-space-size=4096 --experimental-vm-modules',
        },
        name: 'the flag in NODE_OPTIONS',
      },
    ])(
      'says last at the 20th unit with $name, and exits once that is out',
      async ({ options }) => {
        let booted = await boot(options)

        await expect(runUnits(booted, 20)).resolves.toStrictEqual([
          ...Array.from({ length: 19 }, () => false),
          true,
        ])
        expect(booted.exits).toStrictEqual([])

        booted.callbacks.at(-1)!(null)

        expect(booted.exits).toStrictEqual([0])
      },
    )

    it('never says last for the number of units without them', async () => {
      let booted = await boot({
        nodeOptions: '--experimental-vm-modules-x',
        nodeFlags: ['--stack-trace-limit=50'],
      })

      await expect(runUnits(booted, 25)).resolves.toStrictEqual(
        Array.from({ length: 25 }, () => false),
      )
    })
  })

  it('writes the stack of what a unit threw and exits with 1, without done', async () => {
    let error = new Error('cannot open the out file')
    vi.mocked(runUnit).mockRejectedValue(error)
    let booted = await boot()
    deliver(booted)
    await vi.waitFor(() => {
      expect(booted.exits).toStrictEqual([1])
    })

    expect(booted.errors).toStrictEqual([`mootant: ${error.stack!}\n`])
    expect(booted.sent).toStrictEqual([{ type: 'ready' }])
  })

  it('writes the message of what a unit threw with no stack', async () => {
    vi.mocked(runUnit).mockRejectedValue('no stack here')
    let booted = await boot()
    deliver(booted)
    await vi.waitFor(() => {
      expect(booted.exits).toStrictEqual([1])
    })

    expect(booted.errors).toStrictEqual(['mootant: no stack here\n'])
  })

  it('exits when the channel closes', async () => {
    let booted = await boot()
    booted.listeners.get('disconnect')![0]!(undefined)

    expect(booted.exits).toStrictEqual([0])
  })
})
