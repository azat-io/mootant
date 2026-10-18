import type { TestAdapter } from './test-adapter'

/**
 * Adapter that comes with mootant, loaded only when a run needs it.
 */
export interface BuiltInAdapter {
  /**
   * Tells how surely the project uses the adapter's test runner, such as
   * whether it is installed or named in the test scripts. `start` reports an
   * unsupported version.
   */
  detect(root: string): Promise<DetectionScore>

  /**
   * Imports the adapter and creates it with default options.
   */
  load(): Promise<TestAdapter>
}

/**
 * Adapters that come with mootant, keyed by the name `run.runner` uses, in
 * detection order. The command line passes them to the core, so the core never
 * names a test runner.
 */
export type BuiltInAdapters = Record<string, BuiltInAdapter>

/**
 * How surely a project uses a test runner: 0 or false when it does not, 1 or
 * true when the runner is installed or its tests look like the runner's, 2 when
 * a script the project runs its tests with calls the runner.
 */
export type DetectionScore = boolean | 0 | 1 | 2
