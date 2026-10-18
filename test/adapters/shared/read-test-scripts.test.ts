import { writeFile, mkdtemp, rm } from 'node:fs/promises'
import { afterEach, describe, expect, it } from 'vitest'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { readTestScripts } from '../../../adapters/shared/read-test-scripts'

/**
 * Temporary project of the current test.
 */
let root = ''

/**
 * Writes the `package.json` of a fresh temporary project.
 *
 * @param manifest - Text of the file, or an object written as JSON.
 * @returns Absolute path of the project.
 */
async function createProject(manifest: object | string): Promise<string> {
  root = await mkdtemp(path.join(tmpdir(), 'mootant-scripts-'))
  await writeFile(
    path.join(root, 'package.json'),
    typeof manifest === 'string' ? manifest : JSON.stringify(manifest),
  )
  return root
}

describe('readTestScripts', () => {
  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('lists the test script first, then other test scripts and what they run', async () => {
    await createProject({
      scripts: Object.fromEntries<unknown>([
        ['test:types', 'check-dts'],
        ['test_e2e', 'playwright test'],
        ['testing', 'not a test script'],
        ['unit', 'vitest run'],
        ['test', 'NODE_ENV=test cross-env CI=1 pnpm run unit && npm t'],
        ['build', 'vite build'],
        ['lint', 'eslint .'],
        ['loop', 'pnpm loop'],
        ['test-lint', 'yarn lint; bun run-script loop | npm run missing'],
        ['other', 42],
      ]),
    })

    await expect(readTestScripts(root)).resolves.toStrictEqual([
      'NODE_ENV=test cross-env CI=1 pnpm run unit && npm t',
      'check-dts',
      'playwright test',
      'yarn lint; bun run-script loop | npm run missing',
      'vitest run',
      'eslint .',
      'pnpm loop',
    ])
  })

  it('follows pnpm patterns and the patterns of npm-run-all', async () => {
    await createProject({
      scripts: Object.fromEntries([
        ['test', 'pnpm run "/^check:/" && pnpm run /(/ && pnpm --silent'],
        ['check:a', 'run-s "spec:*" -- --flag'],
        ['check:b', 'run-p "e2e.*"'],
        ['spec:one', 'node --test'],
        ['spec:one:deep', 'never'],
        ['e2e.x', 'escaped dot'],
        ['e2eYx', 'not matched'],
        ['unused', 'npm-run-all spec:one'],
      ]),
    })

    await expect(readTestScripts(root)).resolves.toStrictEqual([
      'pnpm run "/^check:/" && pnpm run /(/ && pnpm --silent',
      'run-s "spec:*" -- --flag',
      'run-p "e2e.*"',
      'node --test',
      'escaped dot',
    ])
  })

  it('lists nothing without scripts or a readable package.json', async () => {
    await createProject({ name: 'empty' })

    await expect(readTestScripts(root)).resolves.toStrictEqual([])

    await rm(root, { recursive: true })
    await createProject('{ broken')

    await expect(readTestScripts(root)).resolves.toStrictEqual([])
    await expect(
      readTestScripts(path.join(root, 'missing')),
    ).resolves.toStrictEqual([])
  })
})
