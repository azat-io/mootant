import type { Linter } from 'eslint'

import eslintConfig from '@azat-io/eslint-config'
import { globalIgnores } from 'eslint/config'

/**
 * Shared configuration of the author's projects.
 */
let config = await eslintConfig({
  perfectionist: true,
  typescript: true,
  vitest: true,
  node: true,
})

export default [
  globalIgnores(['test/fixtures/'], 'mootant/fixtures'),
  ...config,
] satisfies Linter.Config[]
