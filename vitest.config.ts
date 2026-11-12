import { configDefaults, defineConfig, mergeConfig } from 'vitest/config'

import viteConfig from './vite.config.ts'

/**
 * Test files whose every test runs on each major version of Jest. A project per
 * version runs them with `MOOTANT_TEST_JEST`, so the two versions run at the
 * same time instead of one after the other.
 */
const PER_JEST_VERSION = [
  'test/adapters/jest/index.equivalence.test.ts',
  'test/adapters/jest/index.warm-safety-edges.test.ts',
  'test/adapters/jest/index.warm-safety.test.ts',
]

export default defineConfig(
  mergeConfig(viteConfig, {
    test: {
      projects: [
        { test: { exclude: PER_JEST_VERSION, name: 'unit' }, extends: true },
        ...['29', '30'].map(major => ({
          test: {
            env: { MOOTANT_TEST_JEST: major },
            include: PER_JEST_VERSION,
            name: `jest-${major}`,
          },
          extends: true,
        })),
      ],
      coverage: {
        thresholds: {
          statements: 100,
          functions: 100,
          branches: 100,
          lines: 100,
        },
        include: ['adapters/**', 'cli/**', 'core/**'],
        provider: 'v8',
      },
      exclude: [...configDefaults.exclude, 'test/fixtures/**', 'docs/demo/**'],
      css: { include: [/\.css\?raw$/u] },
    },
  }),
)
