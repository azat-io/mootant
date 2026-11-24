import { afterEach, describe, expect, it, vi } from 'vitest'
import { writeFile, mkdtemp, rm } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import type { NodeTestHandle } from '../../../adapters/node-test/types/node-test-handle'
import type { UnitEnd } from '../../../types/adapter/unit-end'

import { createSpareProcesses } from '../../../adapters/node-test/create-spare-processes'
import { createTestProcessOutcome } from '../../helpers/create-test-process-outcome'
import { runTestFile } from '../../../adapters/node-test/run-test-file'
import { runIsolated } from '../../../adapters/node-test/run-isolated'
import { createNodeTestTry } from '../../helpers/create-node-test-try'
import { createNodeTestEnd } from '../../helpers/create-node-test-end'

vi.mock(import('../../../adapters/node-test/run-test-file'), () => ({
  runTestFile: vi.fn(),
}))

vi.mock(
  import('../../../adapters/node-test/create-spare-processes'),
  async importOriginal => {
    let actual = await importOriginal()
    return { createSpareProcesses: vi.fn(actual.createSpareProcesses) }
  },
)

/**
 * Work directory and project of the current test.
 */
let directory = ''

describe('runIsolated', () => {
  afterEach(async () => {
    vi.mocked(createSpareProcesses).mockReset()
    vi.mocked(runTestFile).mockReset()
    await rm(directory, { recursive: true, force: true })
  })

  it('runs every unit with its mutant and reports facts and inputs', async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'mootant-isolated-'))
    let onUnitEnd = vi.fn<(end?: UnitEnd) => void>()
    let plain = path.join(directory, 'a.test.js')
    let todo = path.join(directory, 'b.test.js')
    await writeFile(plain, 'test("a", () => {})')
    await writeFile(todo, 'test("b")')
    await writeFile(path.join(directory, 'package.json'), '{}')
    let handle: NodeTestHandle = {
      context: {
        files: [{ file: '/p/src/a.js', switched: 's', original: 'o' }],
        workDirectory: directory,
        concurrency: null,
        root: directory,
        onUnitEnd,
      },
      state: {
        expected: new Map([[todo, [{ occurrence: 0, name: 'b' }]]]),
        todo: new Map([[todo, true]]),
        modules: new Map(),
        plan: null,
        count: 0,
      },
      preload: '/m/preload/preload.js',
      checkTypeScript: () => null,
      files: [plain, todo],
      groups: new Set(),
      commonjs: false,
      testTimeout: 0,
      node: 'node',
      pipe: false,
      workers: 2,
      tsx: false,
      spares: 0,
      args: [],
      env: {},
    }
    vi.mocked(runTestFile).mockImplementation((_handle, input) =>
      Promise.resolve(
        createTestProcessOutcome(
          input.mutant === 'm3' ?
            []
          : [createNodeTestEnd({ environment: ['A'], reached: true })],
        ),
      ),
    )
    let limits = { hitLimit: 10, timeout: 500 }

    let result = await runIsolated(handle, {
      units: [
        { mutant: 'm1', project: '', file: plain, limits },
        { mutant: 'm2', project: '', file: todo, limits },
        { mutant: 'm3', project: '', file: plain, limits },
      ],
    })

    expect(
      result.units.map(unit => [unit.unit, unit.reached, unit.inputs]),
    ).toStrictEqual([
      [
        0,
        true,
        {
          dependencies: [
            path.join(directory, 'a.test.js'),
            path.join(directory, 'a.test.js.snapshot'),
            path.join(directory, 'package.json'),
          ],
          environment: ['A'],
        },
      ],
      [
        1,
        true,
        {
          dependencies: [
            path.join(directory, 'b.test.js'),
            path.join(directory, 'b.test.js.snapshot'),
            path.join(directory, 'package.json'),
          ],
          environment: ['A'],
        },
      ],
      [2, false, null],
    ])
    expect(
      onUnitEnd.mock.calls
        .map(([end]) => end!)
        .toSorted((left, right) => left.unit - right.unit),
    ).toStrictEqual(result.units.map(facts => ({ unit: facts.unit, facts })))
    let inputs = vi.mocked(runTestFile).mock.calls.map(call => call[1])
    expect(
      inputs.map(input => [input.mutant, input.bail, input.expected]),
    ).toStrictEqual([
      ['m1', true, []],
      ['m2', false, [{ occurrence: 0, name: 'b' }]],
      ['m3', true, []],
    ])
    expect(inputs[0]).toMatchObject({ mode: 'isolated', hitLimit: 10 })
    expect(inputs[0]!.deadline({ records: [], spawned: 0, last: 0 })).toBe(
      10_500,
    )
    expect(JSON.parse(readFileSync(inputs[0]!.plan, 'utf8'))).toStrictEqual({
      '/p/src/a.js': path.join(directory, 'switched', '0.json'),
    })

    vi.mocked(runTestFile).mockClear()
    handle.state.plan = '/earlier/plan.json'
    await runIsolated(handle, {
      units: [{ mutant: 'm1', project: '', file: plain, limits }],
    })

    expect(vi.mocked(runTestFile).mock.calls[0]![1].plan).toBe(
      '/earlier/plan.json',
    )
  })

  it('runs units of one test file at once only with parallel units', async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'mootant-isolated-'))
    let file = path.join(directory, 'a.test.js')
    /**
     * Runs two units of one test file and counts how many ran at once.
     *
     * @param parallelUnits - Whether the context allows parallel units.
     * @returns Most units that ran at the same time.
     */
    async function countOverlap(parallelUnits: boolean): Promise<number> {
      let running = 0
      let most = 0
      vi.mocked(runTestFile).mockImplementation(async () => {
        running += 1
        most = Math.max(most, running)
        await new Promise(resolve => {
          setTimeout(resolve, 20)
        })
        running -= 1
        return createTestProcessOutcome([createNodeTestEnd({ reached: true })])
      })
      let handle: NodeTestHandle = {
        context: {
          workDirectory: directory,
          concurrency: null,
          root: directory,
          parallelUnits,
          files: [],
        },
        state: {
          expected: new Map(),
          modules: new Map(),
          todo: new Map(),
          plan: null,
          count: 0,
        },
        preload: '/m/preload/preload.js',
        checkTypeScript: () => null,
        groups: new Set(),
        commonjs: false,
        testTimeout: 0,
        files: [file],
        node: 'node',
        pipe: false,
        workers: 2,
        tsx: false,
        spares: 0,
        args: [],
        env: {},
      }
      let limits = { hitLimit: 10, timeout: 500 }
      let result = await runIsolated(handle, {
        units: [
          { mutant: 'm1', project: '', limits, file },
          { mutant: 'm2', project: '', limits, file },
        ],
      })

      expect(result.units.map(unit => unit.unit)).toStrictEqual([0, 1])

      return most
    }

    await expect(countOverlap(false)).resolves.toBe(1)
    await expect(countOverlap(true)).resolves.toBe(2)
  })

  it('runs a unit again without bail when it stopped for a todo test', async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'mootant-isolated-'))
    let file = path.join(directory, 'a.test.js')
    let handle: NodeTestHandle = {
      state: {
        expected: new Map(),
        modules: new Map(),
        todo: new Map(),
        plan: null,
        count: 0,
      },
      context: {
        workDirectory: directory,
        concurrency: null,
        root: directory,
        files: [],
      },
      preload: '/m/preload/preload.js',
      checkTypeScript: () => null,
      groups: new Set(),
      commonjs: false,
      testTimeout: 0,
      files: [file],
      node: 'node',
      pipe: false,
      workers: 1,
      tsx: false,
      spares: 0,
      args: [],
      env: {},
    }
    vi.mocked(runTestFile).mockImplementation((_handle, input) =>
      Promise.resolve(
        createTestProcessOutcome(
          input.bail ?
            [
              createNodeTestTry({ failed: true, name: 'a', seq: 0 }),
              { kind: 'bail', seq: 0 },
              { kind: 'todo-try', seq: 0 },
            ]
          : [
              createNodeTestTry({ failed: true, name: 'a', seq: 0 }),
              { kind: 'todo-try', seq: 0 },
              createNodeTestTry({ name: 'b', seq: 1 }),
              createNodeTestEnd(),
            ],
        ),
      ),
    )
    let limits = { hitLimit: 10, timeout: 500 }

    let result = await runIsolated(handle, {
      units: [{ mutant: 'm1', project: '', limits, file }],
    })

    expect(
      vi.mocked(runTestFile).mock.calls.map(call => call[1].bail),
    ).toStrictEqual([true, false])
    expect(
      result.units[0]!.tests.map(test => [test.failed, test.message]),
    ).toStrictEqual([
      [false, null],
      [false, null],
    ])
  })

  it('runs units in spares, starts a new process where a spare cannot serve, and stops the spares left, also after an error', async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'mootant-isolated-'))
    let file = path.join(directory, 'a.test.js')
    let other = path.join(directory, 'b.test.js')
    let third = path.join(directory, 'c.test.js')
    let spare = { pid: 5 } as never
    let spares = {
      take: vi.fn((index: number, fresh: boolean) =>
        !fresh && index > 1 ? spare : null,
      ),
      stop: vi.fn(),
    }
    let start = {
      hooks: 'sync' as const,
      kind: 'start' as const,
      node: 'v26.0.0',
      time: 0,
      pid: 1,
    }
    vi.mocked(createSpareProcesses).mockReturnValue(spares)
    vi.mocked(runTestFile).mockImplementation((_handle, input) => {
      if (input.mutant === 'm5') {
        return Promise.reject(new Error('broken'))
      }
      if (input.spare === undefined) {
        return Promise.resolve(
          createTestProcessOutcome([start, createNodeTestEnd()], {
            lingering:
              input.mutant === 'm1' || (input.mutant === 'm3' && !input.bail),
          }),
        )
      }
      return Promise.resolve(
        createTestProcessOutcome(
          input.mutant === 'm3' ?
            [
              start,
              createNodeTestTry({ failed: true, name: 'a', seq: 0 }),
              { kind: 'bail', seq: 0 },
              { kind: 'todo-try', seq: 0 },
            ]
          : [],
        ),
      )
    })
    let handle: NodeTestHandle = {
      state: {
        expected: new Map(),
        modules: new Map(),
        todo: new Map(),
        plan: null,
        count: 0,
      },
      context: {
        workDirectory: directory,
        concurrency: null,
        root: directory,
        files: [],
      },
      preload: '/m/preload/preload.js',
      checkTypeScript: () => null,
      files: [file, other, third],
      groups: new Set(),
      commonjs: false,
      testTimeout: 0,
      node: 'node',
      pipe: true,
      workers: 1,
      tsx: false,
      spares: 2,
      args: [],
      env: {},
    }
    let limits = { hitLimit: 10, timeout: 500 }
    let units = [
      { mutant: 'm1', project: '', limits, file },
      { mutant: 'm2', project: '', limits, file },
      { mutant: 'm3', project: '', file: other, limits },
      { mutant: 'm4', project: '', limits, file },
      { mutant: 'm6', project: '', file: third, limits },
    ]

    let result = await runIsolated(handle, { units })

    expect(vi.mocked(createSpareProcesses)).toHaveBeenCalledWith(handle, [
      { key: file, file },
      { key: file, file },
      { file: other, key: other },
      { key: file, file },
      { file: third, key: third },
    ])
    expect(spares.take.mock.calls).toStrictEqual([
      [0, false],
      [1, true],
      [2, false],
      [3, true],
      [4, false],
    ])
    expect(
      vi
        .mocked(runTestFile)
        .mock.calls.map(([, input]) => [input.mutant, input.bail, input.spare]),
    ).toStrictEqual([
      ['m1', true, undefined],
      ['m2', true, undefined],
      ['m3', true, spare],
      ['m3', false, undefined],
      ['m4', true, undefined],
      ['m6', true, spare],
      ['m6', true, undefined],
    ])
    expect(result.units.map(unit => unit.incomplete)).toStrictEqual([
      null,
      null,
      null,
      null,
      null,
    ])
    expect(spares.stop).toHaveBeenCalledExactlyOnceWith()

    await expect(
      runIsolated(
        { ...handle, context: { ...handle.context, parallelUnits: true } },
        { units: [{ mutant: 'm5', project: '', limits, file }, ...units] },
      ),
    ).rejects.toThrow('broken')
    expect(vi.mocked(createSpareProcesses).mock.calls[1]![1]).toStrictEqual([
      { key: '0', file },
      { key: '1', file },
      { key: '2', file },
      { file: other, key: '3' },
      { key: '4', file },
      { file: third, key: '5' },
    ])
    expect(spares.stop).toHaveBeenCalledTimes(2)
  })
})
