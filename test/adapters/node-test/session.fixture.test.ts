import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest'
import { execFileSync } from 'node:child_process'
import path from 'node:path'

import { createWorkDirectory } from '../../../core/run/create-work-directory'
import { buildNodeTestPreload } from '../../helpers/build-node-test-preload'
import { nodeTestAdapter } from '../../../adapters/node-test/index'
import { createBuiltIns } from '../../helpers/create-built-ins'
import { shortenDryRuns } from '../../helpers/shorten-dry-runs'
import { runMutants } from '../../../core/run-mutants'

/**
 * Path of the built preload, set before the first test.
 */
let preload = vi.hoisted(() => ({ path: '' }))

vi.mock(import('../../../adapters/node-test/get-preload-path'), () => ({
  getPreloadPath: () => preload.path,
}))

/**
 * Root of the fixture projects.
 */
let fixtures = path.resolve(import.meta.dirname, '../../fixtures/node-test')

/**
 * Node binary of the test processes: `MOOTANT_TEST_NODE` when set, such as an
 * older Node in CI, else the one running the tests.
 */
let node = process.env['MOOTANT_TEST_NODE'] ?? process.execPath

describe('node-test adapter', () => {
  let built: Awaited<ReturnType<typeof buildNodeTestPreload>>

  beforeAll(async () => {
    built = await buildNodeTestPreload()
    preload.path = built.path
  })

  afterAll(async () => {
    await built.remove()
  })

  it('reports the tests of the files that load related modules, and their output', async () => {
    let root = path.join(fixtures, 'basic')
    let work = await createWorkDirectory()
    let output: { file: string | null; text: string }[] = []
    let session = await nodeTestAdapter({ node }).start({
      onOutput: (text, file) => {
        output.push({ file, text })
      },
      workDirectory: work.path,
      concurrency: 2,
      files: [],
      root,
    })
    try {
      let math = path.join(root, 'test/math.test.js')

      expect(session.version).toBe(
        execFileSync(node, ['-p', 'process.versions.node'], {
          encoding: 'utf8',
        }).trim(),
      )
      expect(session.workers).toBe(2)
      expect(session.diagnostics).toStrictEqual([])
      await expect(session.listTestFiles()).resolves.toContain(math)

      // The first dry run runs every test file, and reports those that loaded
      // a related module.
      let dry = await session.dryRun({
        related: ['fraction', 'math', 'range', 'track'].map(name =>
          path.join(root, `src/${name}.js`),
        ),
        timeouts: { file: 60_000, test: 60_000 },
        instrumented: true,
        repeat: false,
        files: null,
      })

      expect(
        dry.files.map(file => [
          path.relative(root, file.file),
          file.concurrent,
          file.loadFailed,
        ]),
      ).toStrictEqual([
        ['test/fraction.test.js', false, false],
        ['test/math.test.js', false, false],
        ['test/range.test.js', false, false],
        ['test/track.test.js', true, false],
      ])
      // Subtests are part of the test around them, and a failing todo test
      // does not fail.
      expect(
        dry.tests.map(test => [
          path.basename(test.file),
          test.name,
          test.tries.map(entry => entry.failed),
        ]),
      ).toStrictEqual([
        ['fraction.test.js', 'halves', [false]],
        ['fraction.test.js', 'rounds thirds', [false]],
        ['fraction.test.js', 'divides by three', [false]],
        ['fraction.test.js', 'halves again', [false]],
        ['math.test.js', 'adds', [false]],
        ['math.test.js', 'tells positive numbers', [false]],
        ['math.test.js', 'gives the sign', [false]],
        ['range.test.js', 'clamp > keeps values in range', [false]],
        ['track.test.js', 'tracked tasks > first', [false]],
        ['track.test.js', 'tracked tasks > second', [false]],
        ['track.test.js', 'ran both at once', [false]],
      ])
      expect(
        output
          .filter(entry => entry.file === math)
          .map(entry => entry.text)
          .join(''),
      ).toContain('gives the sign')
      expect(output.every(entry => entry.file?.endsWith('.test.js'))).toBe(true)
    } finally {
      await session.close()
      await work.remove()
    }
  }, 60_000)

  it('stops on a test file that fails to load without mutants', async () => {
    await expect(
      runMutants({
        builtIns: createBuiltIns('node-test', nodeTestAdapter({ node })),
        cwd: path.join(fixtures, 'broken'),
        paths: ['src'],
        concurrency: 1,
        cache: false,
      }),
    ).rejects.toThrow(
      'Tests fail without mutants; fix them first (1 test file):\n  test/parse.test.js: fails to load: Missing fixture data',
    )
  }, 30_000)

  it('stops on a test that hangs without mutants and names it', async () => {
    await expect(
      runMutants({
        builtIns: createBuiltIns(
          'node-test',
          shortenDryRuns(nodeTestAdapter({ node }), { file: 3000, test: 500 }),
        ),
        cwd: path.join(fixtures, 'stuck'),
        paths: ['src'],
        concurrency: 1,
        cache: false,
      }),
    ).rejects.toThrow(
      'Tests hang without mutants: "waits forever" in test/wait.test.js',
    )
  }, 30_000)
})
