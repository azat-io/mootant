import { writeFile, mkdtemp, rm } from 'node:fs/promises'
import { afterEach, describe, expect, it } from 'vitest'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { scoreJest } from '../../../adapters/jest/score-jest'

/**
 * Temporary project of the current test.
 */
let root = ''

/**
 * Creates a temporary project.
 *
 * @param manifest - Content of its `package.json`, or null for none.
 * @param file - Name of an empty file in its root, if any.
 * @returns Absolute path of the project.
 */
async function createProject(
  manifest: object | null,
  file?: string,
): Promise<string> {
  root = await mkdtemp(path.join(tmpdir(), 'mootant-score-jest-'))
  if (manifest !== null) {
    await writeFile(path.join(root, 'package.json'), JSON.stringify(manifest))
  }
  if (file !== undefined) {
    await writeFile(path.join(root, file), '')
  }
  return root
}

describe('scoreJest', () => {
  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it.each([
    'jest',
    'jest --ci',
    'npx jest',
    'pnpm exec jest',
    'node_modules/.bin/jest',
    'cross-env X=1 jest',
    'node --experimental-vm-modules node_modules/jest/bin/jest.js',
    'node node_modules/jest/bin/jest.js --ci',
  ])('gives 2 when a test script calls Jest: %s', async test => {
    let project = await createProject({
      devDependencies: { jest: '^30.0.0' },
      scripts: { test },
    })

    await expect(scoreJest(project)).resolves.toBe(2)
  })

  it('follows the scripts a test script runs', async () => {
    let project = await createProject({
      scripts: { test: 'pnpm run unit', unit: 'jest' },
    })

    await expect(scoreJest(project)).resolves.toBe(2)
  })

  it.each([
    'jest.config.js',
    'ts-jest',
    '@jest/globals',
    'jest-environment-jsdom',
  ])(
    'gives 0 when a test script names %s and nothing else names Jest',
    async word => {
      let project = await createProject({ scripts: { test: `node ${word}` } })

      await expect(scoreJest(project)).resolves.toBe(0)
    },
  )

  it.each([
    { dependencies: { jest: '^29.7.0' } },
    { devDependencies: { jest: '^30.0.0' } },
    { jest: { testEnvironment: 'node' } },
  ])(
    'gives 1 when package.json names Jest and no test script calls it: %j',
    async fields => {
      let project = await createProject({
        scripts: { test: 'node --test' },
        ...fields,
      })

      await expect(scoreJest(project)).resolves.toBe(1)
    },
  )

  it.each([
    'jest.config.js',
    'jest.config.ts',
    'jest.config.mjs',
    'jest.config.mts',
    'jest.config.cjs',
    'jest.config.cts',
    'jest.config.json',
  ])('gives 1 when the root has %s', async name => {
    let project = await createProject(
      { scripts: { test: 'node --test' } },
      name,
    )

    await expect(scoreJest(project)).resolves.toBe(1)
  })

  it('gives 0 without a package.json or a configuration file of Jest', async () => {
    let project = await createProject(null)

    await expect(scoreJest(project)).resolves.toBe(0)
  })
})
