import type { DryRunRequest } from '../../types/adapter/dry-run-request'
import type { TestAdapter } from '../../types/adapter/test-adapter'

/**
 * Wraps an adapter so that its dry runs use the given, shorter watchdog budgets
 * and a hang shows within seconds.
 *
 * @param adapter - Adapter to wrap.
 * @param timeouts - Budgets of the dry runs.
 * @param timeouts.file - Milliseconds for loading a test file and the work
 *   outside tries, before suite hook timeouts.
 * @param timeouts.test - Milliseconds for an attempt of a test, before its own
 *   timeout and the timeouts of its hooks.
 * @returns Adapter with the shortened dry runs.
 */
export function shortenDryRuns(
  adapter: TestAdapter,
  timeouts: DryRunRequest['timeouts'],
): TestAdapter {
  return {
    ...adapter,
    start: async context => {
      let session = await adapter.start(context)
      return {
        ...session,
        dryRun: request => session.dryRun({ ...request, timeouts }),
      }
    },
  }
}
