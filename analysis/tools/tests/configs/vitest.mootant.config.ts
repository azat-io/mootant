import { configDefaults, defineConfig, mergeConfig } from 'vitest/config'

import baseConfig from './vitest.config.ts'

/**
 * Vitest configuration of the dogfooding runs of section 5: the project's own
 * configuration without the three integration test files that run whole
 * mootant sessions on fixtures (minutes each, the slowest files of the suite).
 * None of them calls the code of the mutated modules of these runs.
 */
export default defineConfig(
  mergeConfig(baseConfig, {
    test: {
      exclude: [
        ...configDefaults.exclude,
        'test/fixtures/**',
        'docs/demo/**',
        'test/adapters/vitest/index.test.ts',
        'test/adapters/node-test/index.test.ts',
        'test/cli/index.test.ts',
      ],
    },
  }),
)
