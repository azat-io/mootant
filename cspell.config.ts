import { defineConfig } from 'cspell'

export default defineConfig({
  ignorePaths: [
    '.github',
    'changelog.md',
    'license',
    'pnpm-lock.yaml',
    'test/fixtures',
    'tsconfig.json',
  ],
  words: [
    'azat',
    'changelogen',
    'changelogithub',
    'mootant',
    'quasis',
    'rolldown',
  ],
  dictionaries: ['css', 'html', 'node', 'npm', 'typescript'],
  useGitignore: true,
  language: 'en',
})
