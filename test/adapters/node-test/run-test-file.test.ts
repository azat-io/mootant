import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import type { NodeTestHandle } from '../../../adapters/node-test/types/node-test-handle'
import type { NodeTestUnit } from '../../../adapters/node-test/types/node-test-unit'

import { runTestProcess } from '../../../adapters/node-test/run-test-process'
import { runTestFile } from '../../../adapters/node-test/run-test-file'

vi.mock(import('../../../adapters/node-test/run-test-process'), () => ({
  runTestProcess: vi.fn(),
}))

/**
 * Work directory of the current test.
 */
let directory = ''

/**
 * Creates a session handle with a fresh work directory.
 *
 * @param context - Fields of the context that differ.
 * @returns Handle whose processes write into a fresh work directory.
 */
async function createHandle(
  context: Partial<NodeTestHandle['context']> = {},
): Promise<NodeTestHandle> {
  directory = await mkdtemp(path.join(tmpdir(), 'mootant-file-'))
  return {
    context: {
      workDirectory: directory,
      concurrency: null,
      root: '/project',
      files: [],
      ...context,
    },
    state: {
      expected: new Map(),
      modules: new Map(),
      todo: new Map(),
      plan: null,
      count: 3,
    },
    args: ['--import', 'preload'],
    checkTypeScript: () => null,
    preload: '/preload.js',
    env: { A: '1' },
    testTimeout: 0,
    node: '/node',
    workers: 1,
    tsx: false,
    files: [],
  }
}

describe('runTestFile', () => {
  afterEach(async () => {
    vi.mocked(runTestProcess).mockReset()
    await rm(directory, { recursive: true, force: true })
  })

  it('runs the file with its unit, routes output and reports the end', async () => {
    let output: [string, string | null][] = []
    let ends = 0
    let handle = await createHandle({
      onOutput: (text, file) => {
        output.push([text, file])
      },
      onUnitEnd: () => {
        ends += 1
      },
    })
    let unit: NodeTestUnit | null = null
    vi.mocked(runTestProcess).mockImplementation(options => {
      unit = JSON.parse(options.env['MOOTANT_UNIT']!) as NodeTestUnit
      expect(readFileSync(unit.out, 'utf8')).toBe('')
      options.onOutput!('text')
      return Promise.resolve({
        signal: null,
        records: [],
        hung: false,
        spawned: 1,
        code: 0,
      })
    })
    /**
     * Deadline that is checked to be passed through.
     *
     * @returns A fixed time.
     */
    function deadline(): number {
      return 5
    }

    await expect(
      runTestFile(handle, {
        file: '/project/a.test.js',
        hitLimit: null,
        plan: '/plan',
        expected: [],
        mutant: null,
        mode: 'dry',
        bail: false,
        deadline,
      }),
    ).resolves.toMatchObject({ code: 0 })
    expect(vi.mocked(runTestProcess).mock.calls[0]![0]).toMatchObject({
      args: ['--import', 'preload', '/project/a.test.js'],
      env: { A: '1' },
      cwd: '/project',
      node: '/node',
      deadline,
    })
    expect(unit).toStrictEqual({
      out: path.join(directory, 'out', '3.jsonl'),
      root: '/project',
      hitLimit: null,
      plan: '/plan',
      expected: [],
      mutant: null,
      mode: 'dry',
      bail: false,
    })
    expect(output).toStrictEqual([['text', '/project/a.test.js']])
    expect(ends).toBe(1)
    expect(handle.state.count).toBe(4)
    await expect(readdir(path.join(directory, 'out'))).resolves.toStrictEqual(
      [],
    )
  })

  it('drops output without a receiver and cleans up after a failure', async () => {
    let handle = await createHandle()
    vi.mocked(runTestProcess).mockRejectedValue(new Error('spawn failed'))

    await expect(
      runTestFile(handle, {
        file: '/project/a.test.js',
        deadline: () => Infinity,
        mode: 'isolated',
        plan: '/plan',
        mutant: 'm1',
        expected: [],
        hitLimit: 10,
        bail: true,
      }),
    ).rejects.toThrow('spawn failed')
    expect(vi.mocked(runTestProcess).mock.calls[0]![0].onOutput).toBeUndefined()
    await expect(readdir(path.join(directory, 'out'))).resolves.toStrictEqual(
      [],
    )
  })
})
