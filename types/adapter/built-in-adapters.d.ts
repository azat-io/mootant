import type { TestAdapter } from './test-adapter'

/**
 * Adapter that comes with mootant, loaded only when a run needs it.
 */
export interface BuiltInAdapter {
  /**
   * Tells whether the project uses the adapter's test runner, such as whether
   * it is installed. `start` reports an unsupported version.
   */
  detect(root: string): Promise<boolean>

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
