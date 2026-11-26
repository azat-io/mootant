import type {
  ForksPoolWorker,
  WorkerResponse,
  TestProject,
  PoolWorker,
} from 'vitest/node'
import type { ChildProcess } from 'node:child_process'

import type {
  PoolWorkerOptions,
  MootantForksPool,
} from './types/mootant-forks-pool'

import { getSpareLimit } from '../shared/get-spare-limit'
import { getSpareKey } from './get-spare-key'

/**
 * Name of mootant's pool; Vitest picks its own pools by name first, so it
 * differs from `forks`.
 */
const POOL_NAME = 'mootant-forks'

/**
 * Flag that tells Vitest's pool a worker's answer from its RPC calls.
 */
const RESPONSE_FLAG = '__vitest_worker_response__'

/**
 * Answer of a worker that finished stopping, as Vitest's pool expects it.
 */
const STOPPED: WorkerResponse = { [RESPONSE_FLAG]: true, type: 'stopped' }

/**
 * Forks worker started before a task needs it, idle until one takes it.
 */
interface Spare {
  /**
   * The worker.
   */
  worker: ForksPoolWorker

  /**
   * Process of the worker.
   */
  child: ChildProcess

  /**
   * Removes the listeners the pool keeps on the worker while it is idle.
   */
  release(): void

  /**
   * Which workers the spare can serve (`getSpareKey`).
   */
  key: string
}

/**
 * Creates the custom pool mootant runs every project with: Vitest's own forks
 * workers, through Vitest's public pool API, with two changes. Vitest asks a
 * worker to stop with a `stop` message and waits for its `stopped` answer, up
 * to a minute, without watching the process meanwhile. A worker that hangs in
 * its teardown never answers, and the watchdog kills it; so when the process of
 * a worker exits while its stop is pending, the pool answers `stopped` in its
 * place, and Vitest goes on at once instead of when its timer runs out. A
 * process that exited is not stopped again: Vitest's forks worker waits for an
 * `exit` event that a process killed by a signal has already sent. Should
 * Vitest change its stop messages, the stop simply waits for Vitest's timer as
 * before.
 *
 * The pool also keeps spare workers for the tasks of the run it is told of
 * (`prepare`): their processes start ahead and load Vitest's worker, but get
 * the project, the test environment and the test file only once a task takes
 * them, as messages of Vitest, so a task skips the start of a process, while no
 * code of the project runs before. After each task takes its worker, spares
 * start in the background for the tasks of its project still to come, as many
 * in all as `getSpareLimit` allows for the project's `maxWorkers`; a task takes
 * a spare whose process runs and whose key matches its own (`getSpareKey`),
 * else starts a worker of its own. A spare that fails or ends is dropped; one
 * that cannot start ends the spares of its project for the run. The spares left
 * stop when the run is over (`drain`). Without spares (`MOOTANT_PREFORK=0`),
 * with a worker whose flags rule them out, or should Vitest stop exposing the
 * process of its first worker, every task starts its own worker.
 *
 * The pool notes when each task got its worker process, so the cost of a unit
 * can include the start of its process.
 *
 * Once the run is interrupted (`interrupt`), the pool stops the process of
 * every worker and spare it started that still runs, with `SIGKILL` through the
 * process itself, which cannot stand for another process before it ended, and
 * starts none: the start of a task fails at once, and a worker refused so has
 * no process to stop. Vitest ends the run then as after a watchdog's kill.
 * Should Vitest stop exposing the processes of its workers, an interrupted run
 * waits until they end or the watchdog stops them.
 *
 * @param Worker - Forks worker class of the project's Vitest.
 * @param spawns - Receives the epoch milliseconds at which a task got its
 *   worker process, by process id.
 * @param prefork - Whether the pool may keep spare workers.
 * @returns Pool to set as the projects' `poolRunner`.
 */
export function createForksPool(
  Worker: typeof ForksPoolWorker,
  spawns: Map<number, number>,
  prefork: boolean,
): MootantForksPool {
  let left = new Map<TestProject, number>()
  let spares: Spare[] = []
  let exposed: boolean | null = null
  let interrupted = false
  let live = new Set<ChildProcess>()
  /**
   * Remembers the process of a worker or a spare until it ends, so that an
   * interrupted run can stop it.
   *
   * @param child - The process.
   */
  function remember(child: ChildProcess): void {
    if (!live.has(child)) {
      live.add(child)
      child.once('exit', () => {
        live.delete(child)
      })
    }
  }
  /**
   * Stops a spare unless its process already ended.
   *
   * @param spare - Spare to stop.
   * @returns Resolves when it is gone.
   */
  async function stopSpare(spare: Spare): Promise<void> {
    if (isRunning(spare.child)) {
      try {
        await spare.worker.stop()
      } catch {}
    }
  }
  /**
   * Starts a spare worker with the options of a task.
   *
   * @param options - Options of the task's worker.
   * @param key - Key of the worker.
   * @returns Whether the spare started.
   */
  function startSpare(options: PoolWorkerOptions, key: string): boolean {
    let worker = new Worker(options)
    let spare: Spare | null = null
    /**
     * Drops the spare once its process failed or ended, and stops it if it
     * still runs.
     */
    function drop(): void {
      if (spare !== null && spares.includes(spare)) {
        spares = spares.filter(entry => entry !== spare)
        void stopSpare(spare)
      }
    }
    /**
     * Starts the spare's process, and drops the spare when it fails to.
     */
    async function launch(): Promise<void> {
      try {
        await worker.start()
      } catch {
        drop()
      }
    }
    worker.on('error', drop)
    void launch()
    let child = readProcess(worker)
    if (child === null || !isRunning(child)) {
      return false
    }
    child.on('exit', drop)
    remember(child)
    spare = {
      release: () => {
        worker.off('error', drop)
        child.off('exit', drop)
      },
      worker,
      child,
      key,
    }
    spares.push(spare)
    return true
  }
  /**
   * Starts the spares that the tasks of a project still to come lack, while the
   * pool holds fewer spares in all than the limit for the project's
   * `maxWorkers` (`getSpareLimit`).
   *
   * @param options - Options of the worker of a task of the project.
   * @param key - Key of that worker.
   */
  function refill(options: PoolWorkerOptions, key: string): void {
    if (interrupted) {
      return
    }
    let { project } = options
    try {
      let limit = getSpareLimit(project.config.maxWorkers)
      let wanted = left.get(project) ?? 0
      for (
        let have = spares.filter(spare => spare.key === key).length;
        have < wanted && spares.length < limit;
        have += 1
      ) {
        if (!startSpare(options, key)) {
          left.delete(project)
          return
        }
      }
    } catch {
      left.delete(project)
    }
  }
  /**
   * Takes a spare whose process runs and whose key matches.
   *
   * @param key - Key of the task's worker.
   * @returns The spare's worker, or null.
   */
  function take(key: string): ForksPoolWorker | null {
    let spare = spares.find(
      entry => entry.key === key && isRunning(entry.child),
    )
    if (spare === undefined) {
      return null
    }
    spares = spares.filter(entry => entry !== spare)
    spare.release()
    return spare.worker
  }
  return {
    createPoolWorker: options => {
      let worker = new Worker(options)
      let key = prefork ? getSpareKey(options) : null
      let listeners = new Set<(message: WorkerResponse) => void>()
      let stopping = false
      let refused = false
      let exited = false
      /**
       * Answers a pending stop for the exited process.
       */
      function answer(): void {
        for (let listener of listeners) {
          listener(STOPPED)
        }
      }
      return {
        start: async () => {
          if (interrupted) {
            refused = true
            throw new Error(
              'The run was interrupted, so mootant starts no Vitest worker.',
            )
          }
          let spawned = Date.now()
          let { project } = options
          let count = left.get(project)
          if (count !== undefined) {
            left.set(project, Math.max(0, count - 1))
          }
          let spare = key === null ? null : take(key)
          if (spare === null) {
            await worker.start()
          } else {
            worker = spare
          }
          let child = readProcess(worker)
          exposed ??= child !== null
          if (child !== null) {
            spawns.set(child.pid!, spawned)
            exited = child.exitCode !== null || child.signalCode !== null
            remember(child)
          }
          worker.on('exit', () => {
            exited = true
            if (stopping) {
              answer()
            }
          })
          if (key !== null && exposed) {
            setImmediate(() => {
              refill(options, key)
            })
          }
        },
        on: (event, callback) => {
          if (event === 'message') {
            listeners.add(callback)
          }
          worker.on(event, callback)
        },
        off: (event, callback) => {
          listeners.delete(callback)
          if (!refused) {
            worker.off(event, callback)
          }
        },
        stop: async () => {
          stopping = false
          if (!exited && !refused) {
            await worker.stop()
          }
        },
        send: message => {
          stopping ||= message.type === 'stop'
          worker.send(message)
        },
        deserialize: data => worker.deserialize(data),
        cacheFs: worker.cacheFs,
        name: worker.name,
      } satisfies PoolWorker
    },
    prepare: specifications => {
      left = new Map()
      for (let { project, pool } of specifications) {
        if (pool === POOL_NAME) {
          left.set(project, (left.get(project) ?? 0) + 1)
        }
      }
    },
    drain: async () => {
      left = new Map()
      let idle = spares
      spares = []
      await Promise.all(idle.map(spare => stopSpare(spare)))
    },
    interrupt: () => {
      interrupted = true
      for (let child of live) {
        child.kill('SIGKILL')
      }
    },
    name: POOL_NAME,
  }
}

/**
 * Reads the process of a started forks worker through its `fork` getter, which
 * Vitest keeps private.
 *
 * @param worker - Started forks worker.
 * @returns The process, or null when the worker does not expose it.
 */
function readProcess(worker: ForksPoolWorker): ChildProcess | null {
  try {
    let child = Reflect.get(worker, 'fork') as Partial<ChildProcess> | undefined
    return typeof child?.pid === 'number' ? (child as ChildProcess) : null
  } catch {
    return null
  }
}

/**
 * Tells whether a process started and has not ended.
 *
 * @param child - The process.
 * @returns Whether it runs.
 */
function isRunning(child: ChildProcess): boolean {
  return (
    child.pid !== undefined &&
    child.exitCode === null &&
    child.signalCode === null
  )
}
