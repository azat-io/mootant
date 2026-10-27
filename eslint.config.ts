import type { Linter } from 'eslint'

import eslintConfig from '@azat-io/eslint-config'
import { globalIgnores } from 'eslint/config'

let config = await eslintConfig({
  perfectionist: true,
  typescript: true,
  vitest: true,
  astro: true,
  node: true,
})

export default [
  globalIgnores(['test/fixtures/', 'docs/demo/'], 'mootant/fixtures'),
  ...config,
] satisfies Linter.Config[]
