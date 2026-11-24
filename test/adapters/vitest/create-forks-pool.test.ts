import type {
  TestSpecification,
  ForksPoolWorker,
  PoolWorker,
} from 'vitest/node'
import type { Mock } from 'vitest'

import { afterEach, describe, expect, it, vi } from 'vitest'
import { setTimeout } from 'node:timers/promises'
import { spawn } from 'node:child_process'
import { EventEmitter } from 'node:events'
import path from 'node:path'

import { createForksPool } from '../../../adapters/vitest/create-forks-pool'
import { getSpareLimit } from '../../../adapters/shared/get-spare-limit'

vi.mock(import('../../../adapters/shared/get-spare-limit'), () => ({
  getSpareLimit: vi.fn(() => 2),
}))

/**
 * Forks worker of a fake Vitest.
 */
interface FakeWorker {
  /**
   * Stops the process: it exits with SIGTERM.
   */
  stop: Mock<() => Promise<void>>

  /**
   * Process of the worker once it started.
   */
  child: FakeChild | null

  /**
   * Listeners of the worker's errors.
   */
  errors: EventEmitter

  /**
   * Options the worker was created with.
   */
  options: unknown

  /**
   * Messages sent to the process.
   */
  sent: unknown[]

  /**
   * Number of starts.
   */
  starts: number
}

/**
 * Process of a fake forks worker.
 */
interface FakeChild extends EventEmitter {
  /**
   * Signal that ended the process, or null.
   */
  signalCode: NodeJS.Signals | null

  /**
   * Exit code of the process, or null.
   */
  exitCode: number | null

  /**
   * Process id.
   */
  pid: number
}

/**
 * Flag of a worker's answer in Vitest's pool.
 */
const RESPONSE_FLAG = '__vitest_worker_response__'

/**
 * Project of the tasks.
 */
let project = { config: { maxWorkers: 3 } }

/**
 * Creates a fake forks worker class; its workers get processes with growing ids
 * when they start.
 *
 * @param behavior - How the workers differ from plain ones.
 * @param behavior.fork - Gives the `fork` of a started worker, its process by
 *   default.
 * @param behavior.start - Gives what the start of the worker with the given
 *   position returns once it forked; it resolves by default.
 * @returns The class and every worker it created, in order.
 */
function createWorkerClass(
  behavior: {
    start?(position: number): Promise<void>
    fork?(worker: FakeWorker): unknown
  } = {},
): {
  create(options: unknown): Partial<ForksPoolWorker>
  Worker: typeof ForksPoolWorker
  workers: FakeWorker[]
} {
  let start = behavior.start ?? (() => Promise.resolve())
  let fork = behavior.fork ?? ((worker: FakeWorker): unknown => worker.child)
  let workers: FakeWorker[] = []
  let pid = 100
  /**
   * Creates the fake forks worker.
   *
   * @param options - Pool options.
   * @returns Fake forks worker.
   */
  function Worker(options: unknown): Partial<ForksPoolWorker> {
    let fake: FakeWorker = {
      stop: vi.fn(() => {
        let { child } = fake
        if (child !== null) {
          child.signalCode = 'SIGTERM'
          child.emit('exit', null, 'SIGTERM')
        }
        return Promise.resolve()
      }),
      // eslint-disable-next-line unicorn/prefer-event-target -- Vitest's forks worker emits errors through an EventEmitter.
      errors: new EventEmitter(),
      child: null,
      starts: 0,
      sent: [],
      options,
    }
    workers.push(fake)
    let position = workers.length - 1
    return {
      start: () => {
        fake.starts += 1
        pid += 1
        // eslint-disable-next-line unicorn/prefer-event-target -- A ChildProcess is an EventEmitter.
        fake.child ??= Object.assign(new EventEmitter(), {
          signalCode: null,
          exitCode: null,
          pid,
        })
        return start(position)
      },
      off: (event, callback) => {
        if (event === 'error') {
          fake.errors.off('error', callback)
        } else {
          fake.child!.off(event, callback)
        }
      },
      on: (event, callback) => {
        if (event === 'error') {
          fake.errors.on('error', callback)
        } else {
          fake.child!.on(event, callback)
        }
      },
      send: message => {
        fake.sent.push(message)
      },
      get fork() {
        return fork(fake)
      },
      deserialize: data => data,
      stop: fake.stop,
      name: 'forks',
      cacheFs: true,
    } as Partial<ForksPoolWorker>
  }
  return { Worker: Worker as never, create: Worker, workers }
}

/**
 * Starts the worker of a task and lets the pool start its spares.
 *
 * @param pool - Pool to take the worker from.
 * @param options - Options of the task's worker.
 * @returns The task's worker.
 */
async function startTask(
  pool: ReturnType<typeof createForksPool>,
  options: never = createOptions(),
): Promise<PoolWorker> {
  let worker = pool.createPoolWorker(options)
  await worker.start()
  await new Promise(resolve => {
    setImmediate(resolve)
  })
  return worker
}

/**
 * Builds the options of a task's worker.
 *
 * @param fields - Fields that differ from the defaults.
 * @returns Pool options.
 */
function createOptions(fields: Record<string, unknown> = {}): never {
  return {
    execArgv: ['--require', '/vitest/suppress-warnings.cjs'],
    distPath: '/vitest/dist',
    env: { A: '1' },
    method: 'run',
    project,
    ...fields,
  } as never
}

/**
 * Builds the test files of a run of the project.
 *
 * @param count - Number of test files.
 * @returns Test specifications.
 */
function createSpecifications(count: number): TestSpecification[] {
  return Array.from(
    { length: count },
    () => ({ pool: 'mootant-forks', project }) as never,
  )
}

describe('createForksPool', () => {
  afterEach(() => {
    vi.mocked(getSpareLimit).mockClear()
  })

  it('passes everything through to the forks worker', async () => {
    let { workers, Worker } = createWorkerClass()
    let pool = createForksPool(Worker, new Map(), true)
    let worker = await startTask(pool)
    let onMessage = vi.fn<(...values: unknown[]) => void>()
    worker.on('message', onMessage)
    worker.send({ type: 'stop' } as never)
    workers[0]!.child!.emit('message', { type: 'stopped' })
    await worker.stop()

    expect(pool.name).toBe('mootant-forks')
    expect(workers).toHaveLength(1)
    expect(workers[0]!.options).toStrictEqual(createOptions())
    expect(worker).toMatchObject({ cacheFs: true, name: 'forks' })
    expect(worker.deserialize('data')).toBe('data')
    expect(workers[0]!.sent).toStrictEqual([{ type: 'stop' }])
    expect(onMessage).toHaveBeenCalledExactlyOnceWith({ type: 'stopped' })
    expect(workers[0]!.stop).toHaveBeenCalledExactlyOnceWith()
  })

  it('answers a pending stop when the process exits', async () => {
    let { workers, Worker } = createWorkerClass()
    let worker = await startTask(createForksPool(Worker, new Map(), true))
    let onMessage = vi.fn<(...values: unknown[]) => void>()
    let other = vi.fn<(...values: unknown[]) => void>()
    worker.on('message', onMessage)
    worker.on('message', other)
    worker.off('message', other)
    worker.send({ type: 'stop' } as never)
    workers[0]!.child!.emit('exit', null, 'SIGKILL')
    await worker.stop()

    expect(onMessage).toHaveBeenCalledExactlyOnceWith({
      [RESPONSE_FLAG]: true,
      type: 'stopped',
    })
    expect(other).not.toHaveBeenCalled()
    expect(workers[0]!.stop).not.toHaveBeenCalled()
  })

  it('leaves an exit without a stop to Vitest', async () => {
    let { workers, Worker } = createWorkerClass()
    let worker = await startTask(createForksPool(Worker, new Map(), true))
    let onMessage = vi.fn<(...values: unknown[]) => void>()
    let onExit = vi.fn<(...values: unknown[]) => void>()
    worker.on('message', onMessage)
    worker.on('exit', onExit)
    worker.send({ type: 'run' } as never)
    workers[0]!.child!.emit('exit', 1, null)

    expect(onExit).toHaveBeenCalledExactlyOnceWith(1, null)
    expect(onMessage).not.toHaveBeenCalled()
  })

  it('notes on the wall clock when a task got its worker process', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: 1000 })
    let { Worker } = createWorkerClass()
    let spawns = new Map<number, number>()
    try {
      await startTask(createForksPool(Worker, spawns, true))
    } finally {
      vi.useRealTimers()
    }

    expect([...spawns]).toStrictEqual([[101, 1000]])
  })

  it('notes nothing and keeps no spares when the worker hides its process', async () => {
    await [
      () => {
        throw new Error('The child process was torn down.')
      },
      () => ({}),
    ].reduce(async (previous, fork) => {
      await previous
      let { workers, Worker } = createWorkerClass({ fork })
      let spawns = new Map<number, number>()
      let pool = createForksPool(Worker, spawns, true)
      pool.prepare(createSpecifications(3))
      await startTask(pool)

      expect(spawns.size).toBe(0)
      expect(workers).toHaveLength(1)
    }, Promise.resolve())
  })

  it('keeps spares for the tasks of a run and hands them over started once', async () => {
    let { workers, Worker } = createWorkerClass()
    let spawns = new Map<number, number>()
    let pool = createForksPool(Worker, spawns, true)
    pool.prepare([
      ...createSpecifications(4),
      { pool: 'typescript', project } as never,
    ])
    await startTask(pool)

    expect(getSpareLimit).toHaveBeenCalledWith(3)
    expect(workers.map(worker => worker.starts)).toStrictEqual([1, 1, 1])

    let handout = Date.now()
    let second = await startTask(pool)
    second.send({ type: 'start' } as never)

    expect(workers[1]!.starts).toBe(1)
    expect(workers[1]!.sent).toStrictEqual([{ type: 'start' }])
    expect(workers[3]!.starts).toBe(0)
    expect(spawns.get(workers[1]!.child!.pid)).toBeGreaterThanOrEqual(handout)
    expect(workers.filter(worker => worker.starts === 1)).toHaveLength(4)

    await startTask(pool)
    await startTask(pool)

    expect(workers.filter(worker => worker.starts === 1)).toHaveLength(4)
    expect(workers.every(worker => worker.stop.mock.calls.length === 0)).toBe(
      true,
    )
  })

  it('serves only tasks of the same key, keeps the spares of all keys within the limit, and drops spares that ended', async () => {
    let { workers, Worker } = createWorkerClass()
    let pool = createForksPool(Worker, new Map(), true)
    pool.prepare(createSpecifications(6))
    await startTask(pool)
    let other = await startTask(pool, createOptions({ env: { A: '2' } }))
    other.send({ type: 'start' } as never)

    expect(workers[3]!.starts).toBe(1)
    expect(workers[3]!.sent).toStrictEqual([{ type: 'start' }])
    expect(workers).toHaveLength(4)

    for (let spare of workers.slice(1, 3)) {
      spare.child!.exitCode = 1
      spare.child!.emit('exit', 1, null)
    }
    let next = await startTask(pool)
    next.send({ type: 'run' } as never)

    expect(workers[4]!.starts).toBe(1)
    expect(workers).toHaveLength(7)
    expect(
      workers
        .filter(worker => worker.sent.length > 0)
        .map(worker => worker.sent),
    ).toStrictEqual([[{ type: 'start' }], [{ type: 'run' }]])
    expect(workers[1]!.stop).not.toHaveBeenCalled()
  })

  it('starts no spares for an unprepared run, when switched off, or for flags that rule them out', async () => {
    await (
      [
        [true, [], createOptions()],
        [false, createSpecifications(3), createOptions()],
        [
          true,
          createSpecifications(3),
          createOptions({ execArgv: ['-r', 'x'] }),
        ],
        [
          true,
          createSpecifications(3),
          createOptions({ env: { NODE_OPTIONS: '--import=x' } }),
        ],
      ] as const
    ).reduce(async (previous, [prefork, specifications, options]) => {
      await previous
      let { workers, Worker } = createWorkerClass()
      let pool = createForksPool(Worker, new Map(), prefork)
      pool.prepare(specifications)
      await startTask(pool, options)
      await startTask(pool, options)

      expect(workers.map(worker => worker.starts)).toStrictEqual([1, 1])
    }, Promise.resolve())
  })

  it('stops a spare whose process fails, and starts no more spares for the run when one cannot start', async () => {
    let { workers, Worker } = createWorkerClass()
    let pool = createForksPool(Worker, new Map(), true)
    pool.prepare(createSpecifications(9))
    await startTask(pool)
    workers[1]!.errors.emit('error', new Error('broken'))

    expect(workers[1]!.stop).toHaveBeenCalledExactlyOnceWith()

    let hidden = false
    let failing = createWorkerClass({
      fork: worker => (hidden ? {} : worker.child),
    })
    pool = createForksPool(failing.Worker, new Map(), true)
    pool.prepare(createSpecifications(9))
    await pool.createPoolWorker(createOptions()).start()
    hidden = true
    await new Promise(resolve => {
      setImmediate(resolve)
    })
    await startTask(pool)

    expect(failing.workers.map(worker => worker.starts)).toStrictEqual([
      1, 1, 1,
    ])
  })

  it('starts no more spares for the run when creating one throws', async () => {
    let { workers, create } = createWorkerClass()
    let created = 0
    /**
     * Creates the fake forks worker, but throws for the second one.
     *
     * @param options - Pool options.
     * @returns Fake forks worker.
     */
    function Throwing(options: unknown): Partial<ForksPoolWorker> {
      created += 1
      if (created === 2) {
        throw new Error('cannot create')
      }
      return create(options)
    }
    let pool = createForksPool(Throwing as never, new Map(), true)
    pool.prepare(createSpecifications(9))
    await startTask(pool)
    await startTask(pool)

    expect(workers.map(worker => worker.starts)).toStrictEqual([1, 1])
  })

  it('drops and stops a spare whose start fails after it forked', async () => {
    let { workers, Worker } = createWorkerClass({
      start: position =>
        position === 1 ?
          Promise.reject(new Error('cannot start'))
        : Promise.resolve(),
    })
    let pool = createForksPool(Worker, new Map(), true)
    pool.prepare(createSpecifications(3))
    await startTask(pool)
    let next = await startTask(pool)
    next.send({ type: 'run' } as never)

    expect(workers[1]!.stop).toHaveBeenCalledExactlyOnceWith()
    expect(workers[2]!.sent).toStrictEqual([{ type: 'run' }])
  })

  it('waits for the spares it drains to stop', async () => {
    let release: (() => void) | undefined
    let { workers, Worker } = createWorkerClass()
    let pool = createForksPool(Worker, new Map(), true)
    pool.prepare(createSpecifications(3))
    await startTask(pool)
    workers[1]!.stop.mockImplementationOnce(
      () =>
        new Promise<void>(resolve => {
          release = resolve
        }),
    )
    let done = false
    /**
     * Drains the pool and notes that the drain finished.
     */
    async function drain(): Promise<void> {
      await pool.drain()
      done = true
    }
    let drained = drain()
    await new Promise(resolve => {
      setImmediate(resolve)
    })

    expect(done).toBe(false)

    release!()
    await drained

    expect(done).toBe(true)
  })

  it('leaves no idle forks worker behind when its parent is killed', async () => {
    let root = path.resolve(import.meta.dirname, '../../..')
    let parent = spawn(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `import { ForksPoolWorker } from 'vitest/node'
        let worker = new ForksPoolWorker({
          project: { vitest: { logger: { outputStream: process.stdout, errorStream: process.stderr } } },
          distPath: ${JSON.stringify(path.join(root, 'node_modules/vitest/dist'))},
          env: process.env,
          execArgv: [],
        })
        await worker.start()
        console.log(worker.fork.pid)
        setInterval(() => {}, 1000)`,
      ],
      { stdio: ['ignore', 'pipe', 'inherit'], cwd: root },
    )
    let pid = await new Promise<number>(resolve => {
      parent.stdout.once('data', (text: Buffer) => {
        resolve(Number.parseInt(text.toString(), 10))
      })
    })
    /**
     * Tells whether the worker's process still runs.
     *
     * @returns Whether it exists.
     */
    function isAlive(): boolean {
      try {
        process.kill(pid, 0)
        return true
      } catch {
        return false
      }
    }
    await setTimeout(500)

    expect(isAlive()).toBe(true)

    parent.kill('SIGKILL')
    let deadline = Date.now() + 2000
    /**
     * Waits until the worker ended or two seconds passed.
     *
     * @returns Resolves then.
     */
    async function waitForEnd(): Promise<void> {
      if (isAlive() && Date.now() < deadline) {
        await setTimeout(50)
        await waitForEnd()
      }
    }
    await waitForEnd()

    expect(isAlive()).toBe(false)
  }, 20_000)

  it('drains the spares left, stopping those that run', async () => {
    let { workers, Worker } = createWorkerClass()
    let pool = createForksPool(Worker, new Map(), true)
    pool.prepare(createSpecifications(9))
    await startTask(pool)
    workers[2]!.child!.signalCode = 'SIGKILL'
    await pool.drain()
    await pool.drain()
    await startTask(pool)

    expect(workers[1]!.stop).toHaveBeenCalledExactlyOnceWith()
    expect(workers[2]!.stop).not.toHaveBeenCalled()
    expect(workers.map(worker => worker.starts)).toStrictEqual([1, 1, 1, 1])
  })

  it('answers a pending stop of a spare a task took', async () => {
    let { workers, Worker } = createWorkerClass()
    let pool = createForksPool(Worker, new Map(), true)
    pool.prepare(createSpecifications(3))
    await startTask(pool)
    let taken = await startTask(pool)
    let onMessage = vi.fn<(...values: unknown[]) => void>()
    taken.on('message', onMessage)
    taken.send({ type: 'stop' } as never)
    workers[1]!.child!.emit('exit', null, 'SIGKILL')
    await taken.stop()

    expect(onMessage).toHaveBeenCalledExactlyOnceWith({
      [RESPONSE_FLAG]: true,
      type: 'stopped',
    })
    expect(workers[1]!.stop).not.toHaveBeenCalled()
  })
})
