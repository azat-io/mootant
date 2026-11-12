import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'

import { createJestReferenceArguments } from '../../helpers/create-jest-reference-arguments'
import { createDryRunRequest } from '../../helpers/create-dry-run-request'
import { runJestBothWays } from '../../helpers/run-jest-both-ways'
import { createJestScope } from '../../helpers/create-jest-scope'
import { createBuiltIns } from '../../helpers/create-built-ins'
import { getJestMajors } from '../../helpers/get-jest-majors'
import { jestAdapter } from '../../../adapters/jest/index'
import { runReference } from '../../helpers/run-reference'
import { runMutants } from '../../../core/run-mutants'
import { isAlive } from '../../helpers/is-alive'

vi.mock(import('node:child_process'), async importOriginal => {
  let actual = await importOriginal()
  return { ...actual, fork: vi.fn(actual.fork) as typeof actual.fork }
})

vi.mock(
  import('../../../adapters/jest/run-on-worker'),
  async importOriginal => {
    let actual = await importOriginal()
    return { runOnWorker: vi.fn(actual.runOnWorker) }
  },
)

/**
 * Major versions of Jest of the rows that run on both, as `MOOTANT_TEST_JEST`
 * narrows them.
 */
let majors = getJestMajors()

/**
 * Copies of fixtures and sessions of the current test, which `cleanUp` ends.
 */
let { clearVariables, createProject, listForked, cleanUp, start } =
  createJestScope()

describe.each(majors)('jest warm safety at the edges on Jest %i', major => {
  beforeEach(clearVariables)

  afterEach(cleanUp)

  it.each([
    {
      paths: [
        'src/unref-a-plain.js',
        'src/unref-b-plain.js',
        'src/unref-c-plain.js',
        'src/unref-leaves.js',
      ],
      name: 'a server no guard sees, left by a kill',
    },
    {
      paths: ['src/hold-finds.js', 'src/hold-leaves.js'],
      name: 'a server left on the other slot',
    },
    {
      paths: ['src/warm-a-plain.js', 'src/warm-leaves.js'],
      name: 'a test that fails on a warm process',
    },
    {
      name: 'a change no guard sees, which a later mutant passes on',
      paths: ['src/web-agent-leaves.js'],
    },
  ])(
    'reads as plain Jest does with $name',
    { timeout: 300_000 },
    async ({ paths }) => {
      let { original, result, rows } = await runJestBothWays(
        await createProject('leftovers', major),
        { paths },
      )

      expect(original).toBe(true)
      expect(
        result.results.filter(entry => entry.status === 'Error'),
      ).toStrictEqual([])
      expect(rows).toStrictEqual(
        rows.map(row => ({ ...row, verdict: row.reference })),
      )
      expect(new Set(rows.map(row => row.reference))).toStrictEqual(
        new Set(['survived', 'killed']),
      )
    },
  )

  it.each([
    {
      title: 'creates a user once',
      test: 'test/users.test.js',
      paths: ['src/users.js'],
      name: 'its first kill',
    },
    {
      name: 'a kill after its first',
      test: 'test/orders.test.js',
      title: 'creates an order',
      paths: ['src/orders.js'],
    },
    {
      paths: ['src/a-quiet.js', 'src/z-slots.js'],
      title: 'creates an order of its worker',
      name: 'a kill, in a store per worker',
      test: 'test/z-slots.test.js',
    },
  ])(
    'stops a run whose test file cannot run again against one global setup, after $name',
    { timeout: 180_000 },
    async ({ paths, title, test }) => {
      let root = await createProject('global', major)
      let output: string[] = []
      let sentence = new RegExp(
        String.raw`^${test.replaceAll('.', String.raw`\.`)} fails when it runs again without mutants: .+; mootant runs a test file many times in one session, against one global setup, so its tests must not be flaky and must reset what they depend on before they run\. A mutant may also have changed or deleted files its tests depend on, such as build output; restore them and keep the code that did it out of runs with an ignore comment\.$`,
        'su',
      )

      await expect(
        runMutants({
          onProgress: event => {
            if (event.kind === 'output' && event.file === test) {
              output.push(event.text)
            }
          },
          builtIns: createBuiltIns('jest', jestAdapter()),
          concurrency: 2,
          cache: false,
          cwd: root,
          paths,
        }),
      ).rejects.toThrow(sentence)
      expect(output.join('')).toContain(title)
      expect(listForked().filter(pid => isAlive(pid))).toStrictEqual([])
      expect(existsSync(path.join(root, 'store-closed'))).toBe(true)

      let plain = await runReference(root, [], {
        args: createJestReferenceArguments(root),
        node: process.execPath,
        testFiles: () => [],
        timeout: 20_000,
      })

      expect(plain.original).toBe(true)
    },
  )

  it(
    'runs a project on open handles serially, as plain Jest does, with no word',
    { timeout: 180_000 },
    async () => {
      // The test files share one fixed port, and fail when they overlap.
      let { original, result, rows } = await runJestBothWays(
        await createProject('open-handles', major),
        { concurrency: null },
      )

      expect(original).toBe(true)
      expect(result.diagnostics).toStrictEqual([])
      expect(
        result.results.filter(entry => entry.status === 'Error'),
      ).toStrictEqual([])
      expect(rows).toStrictEqual(
        rows.map(row => ({ ...row, verdict: row.reference })),
      )
      expect(new Set(rows.map(row => row.reference))).toStrictEqual(
        new Set(['survived', 'killed']),
      )
    },
  )

  it(
    'keeps its heap limit from what a test forks or starts as a thread',
    { timeout: 180_000 },
    async () => {
      let root = await createProject('heap', major)
      let { session } = await start(root)
      let dry = await session.dryRun(
        createDryRunRequest({
          files: [
            { file: path.join(root, 'test/limits.test.js'), project: '' },
          ],
          instrumented: false,
        }),
      )
      let limits = JSON.parse(
        await readFile(path.join(root, 'limits.json'), 'utf8'),
      ) as {
        forked: { flags: string[]; limit: number }
        variable: string | null
        flags: string[]
        thread: number
        own: number
      }

      expect(dry.files).toMatchObject([{ loadFailed: false, errors: [] }])
      expect(limits).toMatchObject({
        forked: { flags: [] },
        variable: null,
        flags: [],
      })
      expect(limits.forked.limit).toBeGreaterThan(limits.own)
      expect(limits.thread).toBeGreaterThan(limits.own)
    },
  )

  it(
    'gives a global setup the concurrency, in place of the workers of the test script',
    { timeout: 300_000 },
    async () => {
      let { original, result, rows } = await runJestBothWays(
        await createProject('per-worker', major),
      )

      expect(original).toBe(true)
      expect(
        result.results.filter(entry => entry.status === 'Error'),
      ).toStrictEqual([])
      expect(rows).toStrictEqual(
        rows.map(row => ({ ...row, verdict: row.reference })),
      )
      expect(new Set(rows.map(row => row.reference))).toStrictEqual(
        new Set(['survived', 'killed']),
      )
    },
  )
})
