import type { ChildProcess } from 'node:child_process'

import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import type { NodeTestHandle } from '../../../adapters/node-test/types/node-test-handle'
import type { NodeTestUnit } from '../../../adapters/node-test/types/node-test-unit'

import { createTestProcessOutcome } from '../../helpers/create-test-process-outcome'
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
 * @param pipe - Whether test processes get their unit on file descriptor 3.
 * @returns Handle whose processes write into a fresh work directory.
 */
async function createHandle(
  context: Partial<NodeTestHandle['context']> = {},
  pipe = false,
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
    groups: new Set([7]),
    env: { A: '1' },
    commonjs: true,
    testTimeout: 0,
    node: '/node',
    workers: 1,
    tsx: false,
    files: [],
    spares: 0,
    pipe,
  }
}

describe('runTestFile', () => {
  afterEach(async () => {
    vi.mocked(runTestProcess).mockReset()
    await rm(directory, { recursive: true, force: true })
  })

  it('runs the file with its unit and routes output', async () => {
    let output: [string, string | null][] = []
    let handle = await createHandle({
      onOutput: (text, file) => {
        output.push([text, file])
      },
    })
    let unit: NodeTestUnit | null = null
    vi.mocked(runTestProcess).mockImplementation(options => {
      unit = JSON.parse(options.env['MOOTANT_UNIT']!) as NodeTestUnit
      expect(readFileSync(unit.out, 'utf8')).toBe('')
      options.onOutput!('text')
      return Promise.resolve(createTestProcessOutcome([], { spawned: 1 }))
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
    expect(vi.mocked(runTestProcess).mock.calls[0]![0].unit).toBeUndefined()
    expect(vi.mocked(runTestProcess).mock.calls[0]![0]).toMatchObject({
      args: ['--import', 'preload', '/project/a.test.js'],
      groups: handle.groups,
      env: { A: '1' },
      cwd: '/project',
      node: '/node',
      deadline,
    })
    expect(unit).toStrictEqual({
      out: path.join(directory, 'out', '3.jsonl'),
      root: '/project',
      commonjs: true,
      hitLimit: null,
      plan: '/plan',
      expected: [],
      mutant: null,
      mode: 'dry',
      bail: false,
      directory,
    })
    expect(output).toStrictEqual([['text', '/project/a.test.js']])
    expect(handle.state.count).toBe(4)
    await expect(readdir(path.join(directory, 'out'))).resolves.toStrictEqual(
      [],
    )
  })

  it('sends the unit on file descriptor 3 where the session can, to a spare process too', async () => {
    let handle = await createHandle({}, true)
    let spare: ChildProcess = { pid: 9 } as never
    vi.mocked(runTestProcess).mockResolvedValue(createTestProcessOutcome([]))
    await [undefined, spare].reduce(async (previous, taken) => {
      await previous
      await runTestFile(handle, {
        file: '/project/a.test.js',
        deadline: () => Infinity,
        ...(taken !== undefined && { spare: taken }),
        mode: 'isolated',
        plan: '/plan',
        mutant: 'm1',
        expected: [],
        hitLimit: 10,
        bail: true,
      })
    }, Promise.resolve())
    let [fresh, spared] = vi
      .mocked(runTestProcess)
      .mock.calls.map(([options]) => options)

    expect(fresh!.env).toStrictEqual({ MOOTANT_UNIT_FD: '3', A: '1' })
    expect(JSON.parse(fresh!.unit!)).toMatchObject({ mutant: 'm1', bail: true })
    expect(fresh!.spare).toBeUndefined()
    expect(spared!.spare).toBe(spare)
    expect(JSON.parse(spared!.unit!)).toMatchObject({
      out: path.join(directory, 'out', '4.jsonl'),
    })
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
