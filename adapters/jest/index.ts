import type { JestAdapterOptions } from './types/jest-adapter-options'
import type { TestAdapter } from '../../types/adapter/test-adapter'

import { startJestSession } from './start-jest-session'
import { version } from '../../package.json'

export type { JestAdapterOptions } from './types/jest-adapter-options'

/**
 * Creates the adapter that runs mutants with the project's Jest 29.7 or later,
 * such as `jestAdapter({ command: 'jest --config jest.unit.js' })` in
 * `run.runner`. It has no parallel units: the units of a test file run as one
 * chain on a warm worker, and the check at the end of the chain takes back the
 * facts of its warm units when the file fails only on warm state.
 *
 * @param options - Test command, when not the one of the test scripts, extra
 *   environment variables, and whether every unit gets a new worker.
 * @returns Adapter named `jest` without batch mode and with mootant's version.
 */
export function jestAdapter(options: JestAdapterOptions = {}): TestAdapter {
  return {
    start: context => startJestSession(context, options),
    name: 'jest',
    batch: false,
    version,
  }
}
