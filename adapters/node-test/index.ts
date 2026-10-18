import type { NodeTestAdapterOptions } from './types/node-test-adapter-options'
import type { TestAdapter } from '../../types/adapter/test-adapter'

import { startNodeTestSession } from './start-node-test-session'
import { version } from '../../package.json'

export type { NodeTestAdapterOptions } from './types/node-test-adapter-options'

/**
 * Creates the adapter that runs mutants with Node's built-in test runner, such
 * as `nodeTestAdapter({ command: 'bnt' })` in `run.runner`.
 *
 * @param options - Test command, test files, flags, variables and Node binary,
 *   when not those of the project's test scripts.
 * @returns Adapter named `node-test` without batch mode and with mootant's
 *   version.
 */
export function nodeTestAdapter(
  options: NodeTestAdapterOptions = {},
): TestAdapter {
  return {
    start: context => startNodeTestSession(context, options),
    name: 'node-test',
    batch: false,
    version,
  }
}
