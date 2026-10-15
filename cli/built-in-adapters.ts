import type { BuiltInAdapters } from '../types/adapter/built-in-adapters'

import { detectVitest } from '../adapters/vitest/detect-vitest'

/**
 * Lists the adapters that come with mootant, in detection order. Each one is
 * imported only when a run uses it. Vitest is detected when the project has it
 * in any version; starting the session reports a version mootant does not
 * support.
 *
 * @returns Adapters by the name `run.runner` uses.
 */
export function getBuiltInAdapters(): BuiltInAdapters {
  return {
    vitest: {
      load: async () => {
        let { vitestAdapter } = await import('../adapters/vitest/index')
        return vitestAdapter()
      },
      detect: async root => (await detectVitest(root)).version !== null,
    },
  }
}
