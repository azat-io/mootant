/**
 * Settings of `jestAdapter()`, which runs mutants with the project's Jest.
 */
export interface JestAdapterOptions {
  /**
   * Extra environment variables of the Jest processes.
   */
  env?: Record<string, string>

  /**
   * Replaces the worker after every unit: slower, and nothing stays in a worker
   * between units; what global setup started and what is on disk stay shared.
   */
  freshWorkers?: boolean

  /**
   * Test command as a `package.json` script has it, such as `jest --config
   * jest.unit.js`; it is parsed, never run. Found in the test scripts of
   * `package.json` when omitted.
   */
  command?: string
}
