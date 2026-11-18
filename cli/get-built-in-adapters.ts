import type { BuiltInAdapters } from '../types/adapter/built-in-adapters'

import { scoreNodeTest } from '../adapters/node-test/score-node-test'
import { scoreVitest } from '../adapters/vitest/score-vitest'
import { scoreJest } from '../adapters/jest/score-jest'

/**
 * Lists the adapters that come with mootant, in detection order: Vitest, Jest,
 * then node:test. Each one is imported only when a run uses it. Vitest is
 * detected when the project's test scripts call it or the project has it in any
 * version; Jest when the test scripts call it, the project depends on it, or
 * its root has a configuration file of Jest or a `jest` key in `package.json`.
 * Starting the session reports a version mootant does not support. The
 * node:test adapter is detected when the test scripts run node:test, the
 * project depends on better-node-test or borp, or its test files import
 * `node:test`.
 *
 * @returns Adapters by the name `run.runner` uses.
 */
export function getBuiltInAdapters(): BuiltInAdapters {
  return Object.fromEntries([
    [
      'vitest',
      {
        load: async () => {
          let { vitestAdapter } = await import('../adapters/vitest/index')
          return vitestAdapter()
        },
        detect: scoreVitest,
      },
    ],
    [
      'jest',
      {
        load: async () => {
          let { jestAdapter } = await import('../adapters/jest/index')
          return jestAdapter()
        },
        detect: scoreJest,
      },
    ],
    [
      'node-test',
      {
        load: async () => {
          let { nodeTestAdapter } = await import('../adapters/node-test/index')
          return nodeTestAdapter()
        },
        detect: scoreNodeTest,
      },
    ],
  ])
}
