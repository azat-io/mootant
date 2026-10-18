import type { TestSpecification } from 'vitest/node'

import type { VitestWorkerOptions } from './types/vitest-worker'
import type { VitestHandle } from './types/vitest-session-state'

import { getErrorMessage } from '../shared/get-error-message'
import { waitForWorkers } from './wait-for-workers'

/**
 * Runs test specifications in the session's Vitest instance with the worker
 * options of a mootant run, then waits until its workers are gone: Vitest stops
 * them after the run, and a unit's end is recorded only after the worker's
 * teardown, the test environment's teardown included. The caller's watchdog
 * must run until this resolves: the wait relies on it to stop workers that hang
 * in their teardown. Failing tests and stray errors are expected in mootant's
 * runs, so the exit code Vitest sets for them is restored.
 *
 * @param handle - Live Vitest instance of the session.
 * @param worker - Kind of the run the workers perform and, for a dry run, the
 *   watchdog budgets and repeats.
 * @param worker.mode - Kind of the run.
 * @param worker.timeouts - Budgets of a dry run, or null.
 * @param worker.repeat - Whether a dry run tries every test twice.
 * @param specifications - Test files to run.
 * @returns First unhandled error of the run, such as a worker that died, or
 *   null.
 */
export async function runSpecifications(
  handle: VitestHandle,
  worker: Omit<VitestWorkerOptions, 'directory' | 'root'>,
  specifications: TestSpecification[],
): Promise<string | null> {
  let { context, vitest } = handle
  let { exitCode } = process
  vitest.provide('mootant', {
    ...worker,
    directory: context.workDirectory,
    root: context.root,
  })
  try {
    let result = await vitest.runTestSpecifications(specifications)
    await waitForWorkers(context.workDirectory)
    let [error] = result.unhandledErrors
    return error === undefined ? null : getErrorMessage(error)
  } finally {
    process.exitCode = exitCode
  }
}
