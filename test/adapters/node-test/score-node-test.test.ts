import { writeFile, mkdtemp, chmod, mkdir, rm } from 'node:fs/promises'
import { afterEach, describe, expect, it } from 'vitest'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { scoreNodeTest } from '../../../adapters/node-test/score-node-test'

/**
 * Temporary project of the current test.
 */
let root = ''

/**
 * Creates a temporary project.
 *
 * @param manifest - Content of `package.json`, or null for none.
 * @param files - Other files by path relative to the root.
 * @returns Absolute path of the project.
 */
async function createProject(
  manifest: Record<string, unknown> | string | null,
  files: Record<string, string> = {},
): Promise<string> {
  root = await mkdtemp(path.join(tmpdir(), 'mootant-score-node-'))
  if (manifest !== null) {
    await writeFile(
      path.join(root, 'package.json'),
      typeof manifest === 'string' ? manifest : JSON.stringify(manifest),
    )
  }
  await Promise.all(
    Object.entries(files).map(async ([file, text]) => {
      await mkdir(path.dirname(path.join(root, file)), { recursive: true })
      await writeFile(path.join(root, file), text)
    }),
  )
  return root
}

describe('scoreNodeTest', () => {
  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it.each([
    'node --test',
    'eslint . && node --import tsx --test "test/**/*.test.ts"',
    'pnpm bnt --coverage 100',
    'cross-env NODE_ENV=test borp',
    'npx tsx --test',
  ])('gives 2 when a test script runs node:test: %s', async test => {
    await expect(
      scoreNodeTest(await createProject({ scripts: { test } })),
    ).resolves.toBe(2)
  })

  it('follows the scripts a test script runs', async () => {
    let project = await createProject({
      scripts: { 'test:unit': 'node --test', test: 'pnpm run test:unit' },
    })

    await expect(scoreNodeTest(project)).resolves.toBe(2)
  })

  it.each(['devDependencies', 'dependencies'])(
    'gives 1 when %s list a node:test wrapper',
    async field => {
      let project = await createProject({
        [field]: { 'better-node-test': '^1.0.0' },
        scripts: { test: 'vitest' },
      })

      await expect(scoreNodeTest(project)).resolves.toBe(1)
    },
  )

  it.each([
    "import { test } from 'node:test'",
    'const test = require("node:test")',
  ])('gives 1 when a test file names node:test: %s', async text => {
    let project = await createProject(
      { dependencies: { borp2: '1' }, devDependencies: null },
      { 'test/a.test.js': 'export {}', 'test/b.test.js': text },
    )

    await expect(scoreNodeTest(project)).resolves.toBe(1)
  })

  it('gives 0 when nothing runs or imports node:test', async () => {
    let project = await createProject(
      { scripts: { test: 'vitest run' } },
      { 'src/a.test.ts': "import { it } from 'vitest'", 'src/b.js': '' },
    )

    await expect(scoreNodeTest(project)).resolves.toBe(0)
  })

  it('skips test files it cannot read', async () => {
    let project = await createProject(null, {
      'test/a.test.js': "import 'node:test'",
    })
    await chmod(path.join(project, 'test/a.test.js'), 0o000)

    await expect(scoreNodeTest(project)).resolves.toBe(0)
  })

  it.each([null, '{'])(
    'reads test files without a readable package.json: %s',
    async manifest => {
      let project = await createProject(manifest, {
        'test.mjs': "import 'node:test'",
      })

      await expect(scoreNodeTest(project)).resolves.toBe(1)
    },
  )
})
