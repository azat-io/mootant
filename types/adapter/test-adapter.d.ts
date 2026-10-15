import type { AdapterContext } from './adapter-context'
import type { AdapterSession } from './adapter-session'

/**
 * Bridge between the runner core and one test runner. The core plans,
 * classifies and decides; an adapter loads the tests, serves the switched
 * files, executes plans and reports raw facts. It never decides a status.
 * Adapters with options are created by a factory, such as `vitestAdapter({
 * config })`.
 */
export interface TestAdapter {
  /**
   * Starts a session: loads the test runner and its configuration once. Rejects
   * with a complete sentence when the runner is missing, has an unsupported
   * version or an unsupported configuration.
   */
  start(context: AdapterContext): Promise<AdapterSession>

  /**
   * Whether `runBatch` is available. Without it every covered mutant runs on
   * the isolated path.
   */
  batch: boolean

  /**
   * Kebab-case name shown in reports, such as `vitest`.
   */
  name: string
}
