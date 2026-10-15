import type { VitestAdapterOptions } from './types/vitest-adapter-options'
import type { TestAdapter } from '../../types/adapter/test-adapter'

import { startVitestSession } from './start-vitest-session'

export type { VitestAdapterOptions } from './types/vitest-adapter-options'

/**
 * Creates the adapter that runs mutants with the project's Vitest 5, such as
 * `vitestAdapter({ config: 'vitest.unit.config.ts' })` in `run.runner`.
 *
 * @param options - Vitest configuration file, when not the one Vitest finds.
 * @returns Adapter named `vitest` with batch mode.
 */
export function vitestAdapter(options: VitestAdapterOptions = {}): TestAdapter {
  return {
    start: context => startVitestSession(context, options),
    name: 'vitest',
    batch: true,
  }
}
