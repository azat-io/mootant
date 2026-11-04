import { defineConfig, mergeConfig } from 'vitest/config'

import baseConfig from './vitest.config.ts'

/**
 * Section 5 experiment: only the tests of the functions that the logging family
 * of core/syntax shows to the rest of the code, without the tests of its five
 * private helpers.
 */
export default defineConfig(
  mergeConfig(baseConfig, {
    test: {
      include: [
        'test/core/syntax/find-logging-calls.test.ts',
        'test/core/syntax/is-logging-call.test.ts',
        'test/core/syntax/is-logger-factory-call.test.ts',
        'test/core/syntax/is-logger-label.test.ts',
        'test/core/syntax/is-log-message.test.ts',
      ],
    },
  }),
)
