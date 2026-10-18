import { writeFile, symlink, mkdtemp, mkdir, rm } from 'node:fs/promises'
import { afterEach, describe, expect, it } from 'vitest'
import { realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { listNodeTestFiles } from '../../../adapters/node-test/list-node-test-files'

/**
 * Temporary project of the current test.
 */
let root = ''

/**
 * Creates a project with empty files.
 *
 * @param files - Paths relative to the project.
 */
async function createProject(files: string[]): Promise<void> {
  root = realpathSync(await mkdtemp(path.join(tmpdir(), 'mootant-files-')))
  await Promise.all(
    files.map(async file => {
      await mkdir(path.dirname(path.join(root, file)), { recursive: true })
      await writeFile(path.join(root, file), '')
    }),
  )
}

/**
 * Lists test files relative to the project.
 *
 * @param patterns - Files, directories and globs.
 * @param defaults - Default globs.
 * @returns Relative paths.
 */
async function list(patterns: string[], defaults: string[]): Promise<string[]> {
  let files = await listNodeTestFiles(root, patterns, defaults)
  return files.map(file => path.relative(root, file))
}

describe('listNodeTestFiles', () => {
  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('matches the default globs outside node_modules and dot directories', async () => {
    await createProject([
      'a.test.js',
      'src/b.test.js',
      'node_modules/c/c.test.js',
      '.cache/d.test.js',
      '.e.test.js',
      'f.js',
    ])

    await expect(list([], ['**/*.test.js'])).resolves.toStrictEqual([
      'a.test.js',
      'src/b.test.js',
    ])
  })

  it('takes files as they are, directories with the defaults, and globs', async () => {
    await createProject([
      'node_modules/x/x.test.js',
      'test/a.test.js',
      'test/unit/b.test.js',
      'spec/c.spec.js',
      'other.test.js',
    ])

    await expect(
      list(
        [
          './node_modules/x/x.test.js',
          path.join(root, 'test'),
          'spec/*.spec.js',
          'missing.test.js',
          'spec/c.spec.js',
        ],
        ['**/*.test.js'],
      ),
    ).resolves.toStrictEqual([
      'node_modules/x/x.test.js',
      'spec/c.spec.js',
      'test/a.test.js',
      'test/unit/b.test.js',
    ])
    await expect(list(['.'], ['**/*.test.js'])).resolves.toStrictEqual([
      'other.test.js',
      'test/a.test.js',
      'test/unit/b.test.js',
    ])
  })

  it('gives real paths once and skips links', async () => {
    await createProject(['a.test.js'])
    await symlink(path.join(root, 'a.test.js'), path.join(root, 'b.test.js'))

    await expect(list(['b.test.js', 'a.test.js'], [])).resolves.toStrictEqual([
      'a.test.js',
    ])
    await expect(list(['*.test.js'], [])).resolves.toStrictEqual(['a.test.js'])
  })
})
