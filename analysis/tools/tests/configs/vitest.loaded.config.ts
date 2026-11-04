import { defineConfig, mergeConfig } from 'vitest/config'

import baseConfig from './vitest.config.ts'

/**
 * Section 5 dogfooding on a shared machine with load average 20-30: the
 * project's configuration with a test timeout of 30 s instead of Vitest's 5 s,
 * so that CPU-bound tests near the default limit do not fail the dry run.
 */
export default defineConfig(
  mergeConfig(baseConfig, { test: { testTimeout: 30_000 } }),
)
