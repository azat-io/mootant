import { defineConfig, mergeConfig } from 'vitest/config'

import baseConfig from './vitest.config.ts'

/**
 * Section 5 experiment: every test of the logging family of core/syntax.
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
        'test/core/syntax/is-logger-name.test.ts',
        'test/core/syntax/is-console-path.test.ts',
        'test/core/syntax/find-message-texts.test.ts',
        'test/core/syntax/is-format-free.test.ts',
        'test/core/syntax/is-plain-message.test.ts',
      ],
    },
  }),
)
