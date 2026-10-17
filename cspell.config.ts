import { defineConfig } from 'cspell'

export default defineConfig({
  words: [
    'azat',
    'cmder',
    'changelogen',
    'changelogithub',
    'instrumenter',
    'iterm',
    'mootant',
    'mootantrc',
    'nosystem',
    'numstat',
    'oldpwd',
    'quasis',
    'rolldown',
    'shlvl',
    'signale',
    'windowid',
  ],
  ignorePaths: [
    '.github',
    'changelog.md',
    'license',
    'pnpm-lock.yaml',
    'test/fixtures',
    'tsconfig.json',
  ],
  dictionaries: ['css', 'html', 'node', 'npm', 'typescript'],
  useGitignore: true,
  language: 'en',
})
