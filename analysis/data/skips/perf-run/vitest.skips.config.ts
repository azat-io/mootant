import { defineConfig, mergeConfig } from 'vitest/config'

import viteConfig from './vite.config.ts'

export default defineConfig(
  mergeConfig(viteConfig, {
    test: {
      include: ['test/rules/sort-heritage-clauses.test.ts', 'test/rules/sort-export-attributes.test.ts'],
    },
  }),
)
