import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { realpath, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import type { JestTimedRecord } from '../../../adapters/jest/types/jest-timed-record'
import type { UnitOutcome } from '../../../adapters/jest/types/unit-outcome'
import type { JestProject } from '../../../adapters/jest/types/jest-project'
import type { JestHandle } from '../../../adapters/jest/types/jest-handle'
import type { WorkerPool } from '../../../adapters/jest/types/worker-pool'
import type { WorkerSlot } from '../../../adapters/jest/types/worker-slot'
import type { JestUnit } from '../../../adapters/jest/types/jest-unit'

import { checkRepeatable } from '../../../adapters/jest/check-repeatable'
import { createHeapCap } from '../../../adapters/jest/create-heap-cap'
import { getTestFileKey } from '../../../core/run/get-test-file-key'
import { runOnWorker } from '../../../adapters/jest/run-on-worker'

vi.mock(import('../../../adapters/jest/run-on-worker'), () => ({
  runOnWorker: vi.fn(),
}))

/**
 * What the sentence says after the failure.
 */
const FIX =
  'mootant runs a test file many times in one session, against one global setup, so its tests must not be flaky and must reset what they depend on before they run. A mutant may also have changed or deleted files its tests depend on, such as build output; restore them and keep the code that did it out of runs with an ignore comment.'

/**
 * The test file of most of these tests.
 */
let file = '/p/test/a.test.js'

/**
 * Directory of the Jest files of the current test.
 */
let directory = ''

/**
 * Outcomes the attempts in each project leave, by the id of the project, in
 * order; the last one repeats, and a project with none passes.
 */
let attempts = new Map<string, UnitOutcome[]>()

/**
 * Attempts sent so far, with whether each is a clean one and whether what it
 * left says its worker goes.
 */
let sent: { discarded: boolean; clean: boolean; unit: JestUnit }[] = []

/**
 * The slot a chain holds.
 */
let slot: WorkerSlot = { worker: null, busy: true, index: 3 }

/**
 * Slots attempts got, in order.
 */
let slots: WorkerSlot[] = []

/**
 * Builds what an attempt left behind.
 *
 * @param finish - Fields of `finish` that differ.
 * @param records - Records before `finish`.
 * @returns What the attempt left behind.
 */
function createOutcome(
  finish: Partial<Extract<JestTimedRecord, { kind: 'finish' }>> = {},
  records: JestTimedRecord[] = [],
): UnitOutcome {
  return {
    records: [
      { kind: 'load', covers: [], time: 40, hits: 0 },
      ...records,
      {
        failureMessage: null,
        consoleOutput: null,
        outcome: 'result',
        execError: null,
        kind: 'finish',
        transforms: [],
        variables: [],
        message: null,
        tracked: true,
        snapshots: 0,
        outside: [],
        realm: null,
        loaded: [],
        covers: [],
        writes: [],
        dirty: [],
        reads: [],
        lines: {},
        time: 100,
        hits: 0,
        ...finish,
      },
    ],
    outOfMemory: null,
    signal: null,
    hung: false,
    done: true,
    startup: 0,
    code: null,
  }
}

/**
 * Creates a session handle, with one nameless project.
 *
 * @param fields - Fields that differ.
 * @returns Handle with a dry run behind it.
 */
function createHandle(fields: Partial<JestHandle> = {}): JestHandle {
  return {
    state: {
      timeouts: { file: 1000, test: 100 },
      plan: '/w/plans/1/plan.json',
      lateTransforms: new Set(),
      transforms: new Set(),
      noFacts: new Set(),
      outside: new Set(),
      reads: new Map(),
      plans: 1,
      units: 4,
    },
    context: {
      workDirectory: path.dirname(directory),
      concurrency: null,
      root: '/p',
      files: [],
    },
    consoles: new Map([
      ['unit', 'stream'],
      ['lint', 'none'],
      ['', 'buffer'],
    ]),
    heap: createHeapCap({ nodeFlags: [], env: {} }),
    projects: [createProject('')],
    pool: {} as WorkerPool,
    freshWorkers: false,
    root: '/p',
    tests: [],
    directory,
    ...fields,
  }
}

/**
 * Builds what an attempt with a failed test left behind.
 *
 * @param message - What the test failed with.
 * @returns What the attempt left behind.
 */
function createFailedTest(message: string): UnitOutcome {
  return createOutcome({ failureMessage: `Jest's text of ${message}` }, [
    {
      realm: 'current',
      timedOut: false,
      reached: false,
      occurrence: 0,
      failed: true,
      covers: null,
      duration: 0,
      kind: 'try',
      name: 'a',
      time: 50,
      hits: 0,
      message,
    },
  ])
}

/**
 * Builds a project.
 *
 * @param name - Name of the project; its id starts with `id-`.
 * @returns A project with that name and id.
 */
function createProject(name: string): JestProject {
  return { config: { id: `id-${name}` }, name } as JestProject
}

describe('checkRepeatable', () => {
  beforeEach(async () => {
    directory = await realpath(
      await mkdtemp(path.join(tmpdir(), 'mootant-repeatable-')),
    )
    attempts = new Map()
    slots = []
    sent = []
    vi.mocked(runOnWorker).mockImplementation((_pool, held, input) => {
      let list = attempts.get(input.unit.project) ?? [createOutcome()]
      let outcome = list.length > 1 ? list.shift()! : list[0]!
      slots.push(held)
      sent.push({
        discarded: !input.clean && input.discardWhen(outcome),
        clean: input.clean,
        unit: input.unit,
      })
      return Promise.resolve(outcome)
    })
  })

  afterEach(async () => {
    vi.mocked(runOnWorker).mockReset()
    await rm(directory, { recursive: true, force: true })
  })

  it('runs a file with no mutant and the plan of the session on the slot of the chain, warm, and stops there after a pass', async () => {
    let handle = createHandle()

    await expect(
      checkRepeatable(handle, slot, [{ project: '', file }]),
    ).resolves.toStrictEqual(new Set())
    expect(sent).toStrictEqual([
      {
        unit: {
          out: path.join(directory, 'out/5.jsonl'),
          plan: '/w/plans/1/plan.json',
          console: 'buffer',
          project: 'id-',
          mutant: null,
          file,
        },
        discarded: false,
        clean: false,
      },
    ])
    expect(slots).toStrictEqual([slot])
    expect(handle.state.units).toBe(5)
  })

  it('gives each attempt the console plain Jest gives the project, as the first attempt of a dry run has', async () => {
    let handle = createHandle({
      projects: [createProject('unit'), createProject('lint')],
    })
    attempts.set('id-unit', [createFailedTest('wrong'), createOutcome()])
    await checkRepeatable(handle, slot, [
      { project: 'unit', file },
      { project: 'lint', file },
    ])

    expect(
      sent.map(({ clean, unit }) => [unit.project, clean, unit.console]),
    ).toStrictEqual([
      ['id-unit', false, 'stream'],
      ['id-unit', true, 'stream'],
      ['id-lint', false, 'none'],
    ])
  })

  it('runs nothing with no file', async () => {
    await expect(
      checkRepeatable(createHandle(), slot, []),
    ).resolves.toStrictEqual(new Set())
    expect(sent).toStrictEqual([])
  })

  it('finds the project by its name', async () => {
    await checkRepeatable(
      createHandle({
        projects: [createProject('unit'), createProject('lint')],
      }),
      slot,
      [{ project: 'lint', file }],
    )

    expect(sent[0]!.unit.project).toBe('id-lint')
  })

  it('takes the deadline from the budgets the dry run kept', async () => {
    await checkRepeatable(createHandle(), slot, [{ project: '', file }])
    let [, , { deadline }] = vi.mocked(runOnWorker).mock.calls[0]!

    expect(deadline([], 5)).toBe(1005)
  })

  it('names a file that fails first and passes a clean attempt on the same slot, with no word to the output', async () => {
    attempts.set('id-', [
      createFailedTest('wrong on a warm worker'),
      createOutcome(),
    ])
    let onOutput = vi.fn<(text: string, from: string | null) => void>()
    let handle = createHandle()
    handle.context.onOutput = onOutput

    await expect(
      checkRepeatable(handle, slot, [{ project: '', file }]),
    ).resolves.toStrictEqual(new Set([file]))
    expect(
      sent.map(({ discarded, clean }) => [clean, discarded]),
    ).toStrictEqual([
      [false, true],
      [true, false],
    ])
    expect(slots).toStrictEqual([slot, slot])
    expect(sent.map(({ unit }) => unit.out)).toStrictEqual([
      path.join(directory, 'out/5.jsonl'),
      path.join(directory, 'out/6.jsonl'),
    ])
    expect(onOutput).not.toHaveBeenCalled()
  })

  it('checks the same file in two projects one after the other on the slot, and tells them apart', async () => {
    let handle = createHandle({
      projects: [createProject('unit'), createProject('lint')],
    })
    attempts.set('id-lint', [createFailedTest('wrong'), createOutcome()])

    await expect(
      checkRepeatable(handle, slot, [
        { project: 'unit', file },
        { project: 'lint', file },
      ]),
    ).resolves.toStrictEqual(
      new Set([getTestFileKey({ project: 'lint', file })]),
    )
    expect(sent.map(({ clean, unit }) => [unit.project, clean])).toStrictEqual([
      ['id-unit', false],
      ['id-lint', false],
      ['id-lint', true],
    ])
  })

  it('rejects at the first file that fails its clean attempt too, with no attempt of another', async () => {
    let handle = createHandle({
      projects: [createProject('unit'), createProject('lint')],
    })
    attempts.set('id-unit', [createFailedTest('wrong')])

    await expect(
      checkRepeatable(handle, slot, [
        { project: 'unit', file },
        { project: 'lint', file },
      ]),
    ).rejects.toThrow('wrong')
    expect(sent.map(({ unit }) => unit.project)).toStrictEqual([
      'id-unit',
      'id-unit',
    ])
  })

  it('rejects with the sentence and the first error of the file when it fails its clean attempt too', async () => {
    attempts.set('id-', [
      createOutcome({ message: 'first attempt', outcome: 'failure' }),
      createOutcome(
        { message: 'the file broke', outcome: 'failure' },
        createFailedTest('a test too').records.slice(1, 2),
      ),
    ])

    await expect(
      checkRepeatable(createHandle(), slot, [{ project: '', file }]),
    ).rejects.toThrow(
      new Error(
        `test/a.test.js fails when it runs again without mutants: the file broke; ${FIX}`,
      ),
    )
    expect(sent.map(entry => entry.clean)).toStrictEqual([false, true])
  })

  it("rejects with a failed test's message when no error is the file's", async () => {
    attempts.set('id-', [
      createFailedTest('first'),
      createFailedTest('wrong status'),
    ])

    await expect(
      checkRepeatable(createHandle(), slot, [{ project: '', file }]),
    ).rejects.toThrow(
      new Error(
        `test/a.test.js fails when it runs again without mutants: wrong status; ${FIX}`,
      ),
    )
  })

  it('rejects when an attempt ends with no finish, in the words of the exit', async () => {
    attempts.set('id-', [
      {
        ...createOutcome(),
        signal: 'SIGABRT',
        records: [],
        done: false,
      },
    ])

    await expect(
      checkRepeatable(createHandle(), slot, [{ project: '', file }]),
    ).rejects.toThrow(
      new Error(
        `test/a.test.js fails when it runs again without mutants: The test process was stopped by SIGABRT before the test file ended; ${FIX}`,
      ),
    )
    expect(sent.map(entry => entry.discarded)).toStrictEqual([true, false])
  })

  it('hands on the text of the last failure alone, with its file, after what a console kept', async () => {
    attempts.set('id-', [
      createFailedTest('first'),
      createOutcome(
        {
          consoleOutput: 'logged before the failure',
          failureMessage: "Jest's text of second",
        },
        createFailedTest('second').records.slice(1, 2),
      ),
    ])
    let onOutput = vi.fn<(text: string, from: string | null) => void>()
    let handle = createHandle()
    handle.context.onOutput = onOutput

    await expect(
      checkRepeatable(handle, slot, [{ project: '', file }]),
    ).rejects.toThrow('second')
    expect(onOutput.mock.calls).toStrictEqual([
      ['logged before the failure', file],
      ["Jest's text of second", file],
    ])
  })

  it('rejects without a context that listens', async () => {
    attempts.set('id-', [createFailedTest('wrong')])

    await expect(
      checkRepeatable(createHandle(), slot, [{ project: '', file }]),
    ).rejects.toThrow('wrong')
  })

  it('hands on nothing for a failure with no text', async () => {
    attempts.set('id-', [
      { ...createOutcome(), records: [], done: false, code: 1 },
    ])
    let onOutput = vi.fn<(text: string, from: string | null) => void>()
    let handle = createHandle()
    handle.context.onOutput = onOutput

    await expect(
      checkRepeatable(handle, slot, [{ project: '', file }]),
    ).rejects.toThrow('exited with code 1')
    expect(onOutput).not.toHaveBeenCalled()
  })

  it('discards the worker of a failing attempt and keeps that of a passing one', async () => {
    attempts.set('id-', [createFailedTest('wrong'), createOutcome()])
    await checkRepeatable(createHandle(), slot, [{ project: '', file }])
    let [first] = vi.mocked(runOnWorker).mock.calls

    expect(sent[0]!.discarded).toBe(true)
    expect(first![2].discardWhen(createOutcome())).toBe(false)
  })

  describe('with fresh workers', () => {
    it('makes a first attempt clean', async () => {
      await checkRepeatable(createHandle({ freshWorkers: true }), slot, [
        { project: '', file },
      ])

      expect(sent.map(({ clean }) => clean)).toStrictEqual([true])
    })

    it('still gives a file that failed a second clean attempt', async () => {
      attempts.set('id-', [createFailedTest('wrong'), createOutcome()])

      await expect(
        checkRepeatable(createHandle({ freshWorkers: true }), slot, [
          { project: '', file },
        ]),
      ).resolves.toStrictEqual(new Set([file]))
      expect(sent.map(entry => entry.clean)).toStrictEqual([true, true])
    })
  })

  it('raises the cap for a worker that ran out of memory, and passes on a clean attempt', async () => {
    let handle = createHandle()
    attempts.set('id-', [
      {
        ...createOutcome(),
        signal: 'SIGABRT',
        outOfMemory: 512,
        records: [],
        done: false,
      },
      createOutcome(),
    ])

    await expect(
      checkRepeatable(handle, slot, [{ project: '', file }]),
    ).resolves.toStrictEqual(new Set([file]))
    expect(handle.heap.current).toBe(1024)
  })

  it('fails on snapshots that fail a plain run with every test passing, as a dry run does', async () => {
    let handle = createHandle()
    attempts.set('id-', [
      createOutcome({ snapshots: 1 }),
      createOutcome({ snapshots: 1 }),
    ])

    await expect(
      checkRepeatable(handle, slot, [{ project: '', file }]),
    ).rejects.toThrow(
      new Error(
        `test/a.test.js fails when it runs again without mutants: Snapshots are obsolete or failed while every test passed, which fails a plain run of Jest too; ${FIX}`,
      ),
    )
    expect(sent).toHaveLength(2)
  })

  it('leaves the reads of the dry run and the end of units alone', async () => {
    let onUnitEnd = vi.fn<() => void>()
    let handle = createHandle()
    handle.context.onUnitEnd = onUnitEnd
    let key = getTestFileKey({ project: '', file })
    handle.state.reads.set(key, ['/p/src/a.js'])
    attempts.set('id-', [createOutcome({ reads: ['/p/other.js'] })])
    await checkRepeatable(handle, slot, [{ project: '', file }])

    expect([...handle.state.reads]).toStrictEqual([[key, ['/p/src/a.js']]])
    expect(onUnitEnd).not.toHaveBeenCalled()
  })

  it('keeps what the transformers of an attempt read that no dry run did, as a later unit on the worker gets the module from memory', async () => {
    let handle = createHandle()
    handle.state.transforms.add('/p/babel.config.js')
    attempts.set('id-', [
      createOutcome({ transforms: ['/p/babel.config.js', '/p/lib/.babelrc'] }),
    ])
    await checkRepeatable(handle, slot, [{ project: '', file }])

    expect(handle.state.lateTransforms).toStrictEqual(
      new Set(['/p/lib/.babelrc']),
    )
    expect(handle.state.transforms).toStrictEqual(
      new Set(['/p/babel.config.js']),
    )
  })
})
