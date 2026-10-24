import type { Config } from 'prettier'

import prettierConfig from '@azat-io/prettier-config'

export default {
  ...prettierConfig,
  overrides: [
    ...(prettierConfig.overrides ?? []),
    {
      files: 'test/fixtures/list/source/**',
      options: { requirePragma: true },
    },
  ],
} satisfies Config
