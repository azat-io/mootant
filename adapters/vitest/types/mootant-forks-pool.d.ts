import type { PoolRunnerInitializer, TestSpecification } from 'vitest/node'

/**
 * Mootant's pool of Vitest forks workers (`createForksPool`), which keeps spare
 * workers for the tasks of a run.
 */
export interface MootantForksPool extends PoolRunnerInitializer {
  /**
   * Tells the pool the test files of the run to come, whose tasks spare workers
   * may serve.
   *
   * @param specifications - Test files of the run.
   */
  prepare(specifications: readonly TestSpecification[]): void

  /**
   * Stops the process of a worker or spare the pool started that still runs,
   * with `SIGKILL` through the process itself, which cannot stand for another
   * process before it ended.
   *
   * @param pid - Process id of the worker.
   * @returns Whether the process was stopped: false when no process of the pool
   *   with this id runs, null when Vitest does not expose the processes of its
   *   workers, so the pool cannot tell.
   */
  stopWorker(pid: number): boolean | null

  /**
   * Stops the spare workers no task took, and the run's spares to come.
   *
   * @returns Resolves when every spare is gone.
   */
  drain(): Promise<void>

  /**
   * Stops the process of every worker and spare the pool started that still
   * runs, as the run is interrupted, and starts none from then on: the start of
   * a task fails at once.
   */
  interrupt(): void
}

/**
 * Options of a worker of a pool, as Vitest gives them for each task.
 */
export type PoolWorkerOptions = Parameters<
  PoolRunnerInitializer['createPoolWorker']
>[0]
