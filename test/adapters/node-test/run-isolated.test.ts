import { afterEach, describe, expect, it, vi } from 'vitest'
import { writeFile, mkdtemp, rm } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import type { NodeTestHandle } from '../../../adapters/node-test/types/node-test-handle'
import type { UnitEnd } from '../../../types/adapter/unit-end'

import { createTestProcessOutcome } from '../../helpers/create-test-process-outcome'
import { runTestFile } from '../../../adapters/node-test/run-test-file'
import { runIsolated } from '../../../adapters/node-test/run-isolated'
import { createNodeTestTry } from '../../helpers/create-node-test-try'
import { createNodeTestEnd } from '../../helpers/create-node-test-end'

vi.mock(import('../../../adapters/node-test/run-test-file'), () => ({
  runTestFile: vi.fn(),
}))

/**
 * Work directory and project of the current test.
 */
let directory = ''

describe('runIsolated', () => {
  afterEach(async () => {
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
      testTimeout: 0,
      node: 'node',
      workers: 2,
      tsx: false,
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
      testTimeout: 0,
      files: [file],
      node: 'node',
      workers: 1,
      tsx: false,
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
})
