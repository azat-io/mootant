import type { TestSpecification } from 'vitest/node'

import type { VitestWorkerOptions } from './types/vitest-worker'
import type { VitestHandle } from './types/vitest-session-state'

import { getErrorMessage } from '../shared/get-error-message'
import { listScriptDefines } from './list-script-defines'
import { waitForWorkers } from './wait-for-workers'

/**
 * Runs test specifications in the session's Vitest instance with the worker
 * options of a mootant run, then waits until its workers are gone: Vitest stops
 * them after the run, and a unit's end is recorded only after the worker's
 * teardown, the test environment's teardown included. The caller's watchdog
 * must run until this resolves: the wait relies on it to stop workers that hang
 * in their teardown. Failing tests and unhandled errors, such as a worker that
 * died, are expected in mootant's runs, so the exit code Vitest sets for them
 * is restored. When the context allows parallel units, the workers are told so,
 * and a unit of an isolated run does not wait for the unit before it of the
 * same test file; the pool then keeps spare workers for the units of the run
 * (`MootantForksPool.prepare`). Otherwise the worker of a unit starts while the
 * unit before it runs and waits for it, so spares would only add load. The
 * spares left stop once Vitest ends the run, as no unit claims them, so the
 * wait for workers never sees them. The options name the defines each project
 * runs as a script (`listScriptDefines`).
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
  worker: Omit<
    VitestWorkerOptions,
    'directory' | 'parallel' | 'defines' | 'root'
  >,
  specifications: TestSpecification[],
): Promise<string | null> {
  let { context, vitest, state } = handle
  let { exitCode } = process
  vitest.provide('mootant', {
    ...worker,
    ...(context.parallelUnits === true && { parallel: true }),
    defines: listScriptDefines(vitest),
    directory: context.workDirectory,
    root: context.root,
  })
  let parallel = context.parallelUnits === true && worker.mode === 'isolated'
  state.pool.prepare(parallel ? specifications : [])
  try {
    let result: Awaited<ReturnType<typeof vitest.runTestSpecifications>>
    try {
      result = await vitest.runTestSpecifications(specifications)
    } finally {
      await state.pool.drain()
    }
    await waitForWorkers(context.workDirectory)
    let [error] = result.unhandledErrors
    return error === undefined ? null : getErrorMessage(error)
  } finally {
    process.exitCode = exitCode
  }
}
