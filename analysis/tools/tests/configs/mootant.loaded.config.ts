import { vitestAdapter } from 'mootant/vitest'
import { defineConfig } from 'mootant'

export default defineConfig({
  run: { runner: vitestAdapter({ config: 'vitest.loaded.config.ts' }) },
})
