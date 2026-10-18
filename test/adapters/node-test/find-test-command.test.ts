import { writeFile, mkdtemp, rm } from 'node:fs/promises'
import { afterEach, describe, expect, it } from 'vitest'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { findTestCommand } from '../../../adapters/node-test/find-test-command'

/**
 * Temporary project of the current test.
 */
let root = ''

/**
 * Creates a project with the given scripts.
 *
 * @param scripts - Scripts of its `package.json`.
 * @returns Absolute path of the project.
 */
async function createProject(scripts: Record<string, string>): Promise<string> {
  root = await mkdtemp(path.join(tmpdir(), 'mootant-command-'))
  await writeFile(path.join(root, 'package.json'), JSON.stringify({ scripts }))
  return root
}

describe('findTestCommand', () => {
  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('finds the first command of the test scripts that runs node:test', async () => {
    await createProject({
      'test:coverage':
        "pnpm bnt --coverage 100 --coverage-exclude '**/*.test.ts'",
      'test:synced': 'node test/size-synced.ts',
      test: 'pnpm run /^test:/',
      'test:lint': 'oxlint',
    })

    await expect(findTestCommand(root, undefined)).resolves.toStrictEqual({
      env: { NODE_ENV: 'test' },
      tool: 'bnt',
      flags: [],
      files: [],
    })
  })

  it('falls back to plain node --test', async () => {
    await createProject({ test: 'oxlint && node build.js' })

    await expect(findTestCommand(root, undefined)).resolves.toStrictEqual({
      flags: [['--test']],
      tool: 'node',
      files: [],
      env: {},
    })
  })

  it('reads the given command instead of the scripts', async () => {
    await createProject({ test: 'bnt' })

    await expect(
      findTestCommand(root, 'echo start && node --test a.js'),
    ).resolves.toMatchObject({ files: ['a.js'], tool: 'node' })
    await expect(findTestCommand(root, 'vitest run')).rejects.toThrow(
      'The command "vitest run" does not run node:test; give one such as "node --test", "tsx --test", "bnt" or "borp".',
    )
  })
})
