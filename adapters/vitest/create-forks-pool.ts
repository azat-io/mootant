import type {
  PoolRunnerInitializer,
  ForksPoolWorker,
  WorkerResponse,
  PoolWorker,
} from 'vitest/node'

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
 * Creates the custom pool mootant runs every project with: Vitest's own forks
 * workers, through Vitest's public pool API, with one change. Vitest asks a
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
 * @param Worker - Forks worker class of the project's Vitest.
 * @returns Pool to set as the projects' `poolRunner`.
 */
export function createForksPool(
  Worker: typeof ForksPoolWorker,
): PoolRunnerInitializer {
  return {
    createPoolWorker: options => {
      let worker = new Worker(options)
      let listeners = new Set<(message: WorkerResponse) => void>()
      let stopping = false
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
          await worker.start()
          worker.on('exit', () => {
            exited = true
            if (stopping) {
              answer()
            }
          })
        },
        on: (event, callback) => {
          if (event === 'message') {
            listeners.add(callback)
          }
          worker.on(event, callback)
        },
        stop: async () => {
          stopping = false
          if (!exited) {
            await worker.stop()
          }
        },
        off: (event, callback) => {
          listeners.delete(callback)
          worker.off(event, callback)
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
    name: POOL_NAME,
  }
}
