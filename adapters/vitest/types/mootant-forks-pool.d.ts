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
