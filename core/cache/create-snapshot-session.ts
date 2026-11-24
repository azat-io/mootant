import type { AdapterSession } from '../../types/adapter/adapter-session'
import type { DrySnapshot } from '../../types/cache/dry-snapshot'

import { createDryReuseMiss } from './create-dry-reuse-miss'

/**
 * Stands in for the session of the test runner in a run that replays a saved
 * dry run: it lists the test files and tells the cache inputs, version, workers
 * and warnings of the session that saved it, and refuses to run anything, so a
 * run that needs the test runner starts over with it (`createDryReuseMiss`).
 *
 * @param snapshot - Saved dry run of an earlier run that still holds.
 * @returns Session without a test runner.
 */
export function createSnapshotSession(snapshot: DrySnapshot): AdapterSession {
  let { session } = snapshot
  /**
   * Refuses a run of the test runner.
   *
   * @returns A promise rejected with the error of a replay that cannot decide
   *   the run.
   */
  function refuse(): Promise<never> {
    return Promise.reject(
      createDryReuseMiss('some mutants have no cached verdict'),
    )
  }
  return {
    listTestFiles: () => Promise.resolve([...snapshot.testFiles]),
    cacheInputs: () => Promise.resolve(session.inputs),
    ...(session.version !== null && { version: session.version }),
    ...(session.workers !== null && { workers: session.workers }),
    diagnostics: session.diagnostics,
    close: () => Promise.resolve(),
    runIsolated: refuse,
    runBatch: refuse,
    dryRun: refuse,
  }
}
