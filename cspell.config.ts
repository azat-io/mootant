import { defineConfig } from 'cspell'

export default defineConfig({
  words: [
    'azat',
    'cmder',
    'changelogen',
    'changelogithub',
    'mootant',
    'mootantrc',
    'quasis',
    'rolldown',
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
