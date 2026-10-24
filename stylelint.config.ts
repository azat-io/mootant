import type { Config } from 'stylelint'

export default {
  overrides: [
    {
      customSyntax: 'postcss-html',
      files: ['**/*.astro'],
    },
  ],
  extends: '@azat-io/stylelint-config',
  ignoreFiles: ['coverage/**/*'],
} satisfies Config
