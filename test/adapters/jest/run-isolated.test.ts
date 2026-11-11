import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import type { JestTimedRecord } from '../../../adapters/jest/types/jest-timed-record'
import type { UnitOutcome } from '../../../adapters/jest/types/unit-outcome'
import type { JestProject } from '../../../adapters/jest/types/jest-project'
import type { JestHandle } from '../../../adapters/jest/types/jest-handle'
import type { WorkerPool } from '../../../adapters/jest/types/worker-pool'
import type { WorkerSlot } from '../../../adapters/jest/types/worker-slot'
import type { IsolatedUnit } from '../../../types/adapter/isolated-plan'
import type { JestUnit } from '../../../adapters/jest/types/jest-unit'
import type { UnitEnd } from '../../../types/adapter/unit-end'

import { createHeapCap } from '../../../adapters/jest/create-heap-cap'
import { runOnWorker } from '../../../adapters/jest/run-on-worker'
import { runIsolated } from '../../../adapters/jest/run-isolated'

vi.mock(import('../../../adapters/jest/run-on-worker'), () => ({
  runOnWorker: vi.fn(),
}))

/**
 * The test file of most of these tests.
 */
let file = '/p/a.test.js'

/**
 * Another test file.
 */
let other = '/p/b.test.js'

/**
 * Directory of the Jest files of the current test.
 */
let directory = ''

/**
 * Outcomes the runs of each mutant leave, in order; the last one repeats, and a
 * mutant with none passes.
 */
let attempts = new Map<string, UnitOutcome[]>()

/**
 * Outcomes the attempts of the check of each test file leave, in order; the
 * last one repeats, and a file with none passes.
 */
let checks = new Map<string, UnitOutcome[]>()

/**
 * Units sent so far, with the slot each got, whether each is a clean attempt
 * and whether what it left says its worker goes.
 */
let sent: {
  discarded: boolean
  clean: boolean
  unit: JestUnit
  slot: number
}[] = []

/**
 * What happened so far, in order: a unit by its mutant, an attempt of the check
 * by its test file, a drained pool.
 */
let log: string[] = []

/**
 * Builds what a unit with a reach and a passing test left behind.
 *
 * @returns What it left behind.
 */
function createPass(): UnitOutcome {
  let records: JestTimedRecord[] = [
    { kind: 'start', time: 10 },
    { kind: 'load', covers: [], time: 20, hits: 0 },
    { kind: 'reached', time: 30, hits: 1 },
    {
      timedOut: false,
      occurrence: 0,
      message: null,
      reached: true,
      failed: false,
      covers: null,
      duration: 5,
      realm: null,
      kind: 'try',
      name: 'a',
      time: 40,
      hits: 1,
    },
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
      time: 50,
      hits: 1,
    },
  ]
  return {
    outOfMemory: null,
    signal: null,
    hung: false,
    startup: 3,
    done: true,
    code: null,
    records,
  }
}

/**
 * Creates a session handle.
 *
 * @param fields - Fields that differ.
 * @returns Handle with one nameless project and a dry run behind it.
 */
function createHandle(fields: Partial<JestHandle> = {}): JestHandle {
  return {
    state: {
      timeouts: { file: 60_000, test: 60_000 },
      lateTransforms: new Set(),
      transforms: new Set(),
      plan: '/w/plan.json',
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
      ['unit', 'buffer'],
      ['lint', 'buffer'],
      ['', 'buffer'],
    ]),
    heap: createHeapCap({ nodeFlags: [], env: {} }),
    projects: [createProject('')],
    freshWorkers: false,
    pool: createPool(),
    root: '/p',
    tests: [],
    directory,
    ...fields,
  }
}

/**
 * Creates the part of a pool these tests reach.
 *
 * @param size - Number of slots.
 * @returns The pool, whose drain goes to the log.
 */
function createPool(size = 1): WorkerPool {
  let slots: WorkerSlot[] = Array.from({ length: size }, (_, index) => ({
    index: index + 1,
    worker: null,
    busy: false,
  }))
  return {
    take() {
      let slot = slots.find(entry => !entry.busy)!
      slot.busy = true
      return slot
    },
    discardAll: () => {
      log.push('drain')
      return Promise.resolve()
    },
    release(slot) {
      slot.busy = false
    },
    size,
  } as WorkerPool
}

/**
 * Builds what a worker that ran out of memory left behind.
 *
 * @param fields - What differs.
 * @param fields.reached - Whether the unit reached its mutant first.
 * @param fields.cap - Heap limit of the worker.
 * @returns What it left behind.
 */
function createOutOfMemory(fields: {
  reached: boolean
  cap: number
}): UnitOutcome {
  return {
    records: [
      { kind: 'start', time: 10 },
      { kind: 'load', covers: [], time: 20, hits: 0 },
      ...(fields.reached ?
        [{ kind: 'reached', time: 30, hits: 1 } as const]
      : []),
    ],
    outOfMemory: fields.cap,
    signal: 'SIGABRT',
    hung: false,
    done: false,
    startup: 0,
    code: null,
  }
}

/**
 * Builds what a unit that ended with no facts left behind: a test failed with
 * no reach, on a worker that stays alive.
 *
 * @returns What it left behind.
 */
function createFlake(): UnitOutcome {
  let outcome = createPass()
  let [start, load, , attempt, finish] = outcome.records
  return {
    ...outcome,
    records: [
      start!,
      load!,
      {
        ...(attempt as Extract<JestTimedRecord, { kind: 'try' }>),
        realm: 'current',
        message: 'flake',
        reached: false,
        failed: true,
      },
      finish!,
    ],
  }
}

/**
 * Builds what a unit whose test failed after the reach left behind, which is a
 * kill, and what an attempt of the check whose test failed left behind.
 *
 * @param message - What the test failed with.
 * @returns What it left behind.
 */
function createKill(message = 'wrong'): UnitOutcome {
  return createWithReach(record => {
    if (record.kind === 'try') {
      return { ...record, realm: 'current', failed: true, message }
    }
    return record.kind === 'finish' ?
        { ...record, failureMessage: `Jest's text of ${message}` }
      : record
  })
}

/**
 * Builds what a worker that exited in a unit left behind, with a reach.
 *
 * @returns What it left behind.
 */
function createExit(): UnitOutcome {
  return {
    records: [
      { kind: 'start', time: 10 },
      { kind: 'load', covers: [], time: 20, hits: 0 },
      { kind: 'reached', time: 30, hits: 1 },
    ],
    outOfMemory: null,
    signal: null,
    hung: false,
    done: false,
    startup: 0,
    code: 1,
  }
}

/**
 * Builds what a unit with a reach left behind, with some records in place of
 * those it has by default.
 *
 * @param change - Gives the record in place of a record, or null to drop it.
 * @returns What it left behind.
 */
function createWithReach(
  change: (record: JestTimedRecord) => JestTimedRecord | null,
): UnitOutcome {
  let outcome = createPass()
  return {
    ...outcome,
    records: outcome.records.flatMap(record => change(record) ?? []),
  }
}

/**
 * Builds a unit of a plan.
 *
 * @param fields - Fields that differ.
 * @returns A unit of the only test file, with an ordinary limit.
 */
function createUnit(fields: Partial<IsolatedUnit> = {}): IsolatedUnit {
  return {
    limits: { hitLimit: 1000, timeout: 500 },
    mutant: 'm1',
    project: '',
    file,
    ...fields,
  }
}

/**
 * Gives the key of a unit that went without facts.
 *
 * @param fields - Fields of the unit that differ.
 * @returns Its key in `state.noFacts`.
 */
function createKey(fields: Partial<IsolatedUnit> = {}): string {
  let unit = createUnit(fields)
  return [unit.mutant, unit.file, unit.project].join('\0')
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

describe('runIsolated', () => {
  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'mootant-isolated-'))
    attempts = new Map()
    checks = new Map()
    sent = []
    log = []
    vi.mocked(runOnWorker).mockImplementation((_pool, slot, input) => {
      let { file: testFile, mutant } = input.unit
      let list =
        mutant === null ?
          (checks.get(testFile) ?? [createPass()])
        : (attempts.get(mutant) ?? [createPass()])
      let outcome = list.length > 1 ? list.shift()! : list[0]!
      log.push(mutant ?? testFile)
      sent.push({
        discarded: !input.clean && input.discardWhen(outcome),
        clean: input.clean,
        unit: input.unit,
        slot: slot.index,
      })
      return Promise.resolve(outcome)
    })
  })

  afterEach(async () => {
    vi.mocked(runOnWorker).mockReset()
    await rm(directory, { recursive: true, force: true })
  })

  it('gives each unit its fields and a new out file in an existing directory', async () => {
    let handle = createHandle({
      consoles: new Map([
        ['unit', 'stream'],
        ['lint', 'buffer'],
      ]),
      projects: [createProject('unit'), createProject('lint')],
    })
    await runIsolated(handle, {
      units: [
        createUnit({ project: 'lint' }),
        createUnit({
          limits: { hitLimit: Infinity, timeout: 1 },
          project: 'unit',
          mutant: 'm2',
          file: other,
        }),
      ],
    })

    expect(sent.map(entry => entry.unit)).toStrictEqual([
      {
        out: path.join(directory, 'out/5.jsonl'),
        plan: '/w/plan.json',
        project: 'id-lint',
        console: 'buffer',
        hitLimit: 1000,
        mutant: 'm1',
        file,
      },
      {
        out: path.join(directory, 'out/6.jsonl'),
        plan: '/w/plan.json',
        hitLimit: Infinity,
        project: 'id-unit',
        console: 'stream',
        mutant: 'm2',
        file: other,
      },
    ])
    expect(handle.state.units).toBe(6)
    expect(existsSync(path.join(directory, 'out'))).toBe(true)
  })

  it('takes the deadline from the limits of the unit, as they are', async () => {
    await runIsolated(createHandle(), { units: [createUnit()] })
    let [, , { deadline }] = vi.mocked(runOnWorker).mock.calls[0]!

    expect(deadline([], 5)).toBe(60_505)
  })

  it('gives the facts of a unit with its index in the plan', async () => {
    attempts.set('m1', [createExit()])
    let result = await runIsolated(createHandle(), {
      units: [createUnit(), createUnit({ mutant: 'm2' })],
    })

    expect(result.units).toMatchObject([
      {
        tests: [{ reached: true, failed: false, mutant: 'm2' }],
        incomplete: null,
        reached: true,
        startup: 3,
        unit: 1,
      },
    ])
  })

  it('gives the facts what the unit depended on and the variables its code read', async () => {
    attempts.set('m1', [
      createWithReach(record =>
        record.kind === 'finish' ?
          { ...record, reads: ['/p/src/sum.js'], variables: ['TZ'] }
        : record,
      ),
    ])
    let result = await runIsolated(createHandle(), { units: [createUnit()] })

    expect(result.units.map(unit => unit.inputs)).toStrictEqual([
      {
        dependencies: [
          '/p/__snapshots__/a.test.js.snap',
          '/p/a.test.js',
          '/p/package.json',
          '/p/src/package.json',
          '/p/src/sum.js',
          '/package.json',
        ],
        environment: ['TZ'],
      },
    ])
  })

  it('gives no inputs to the facts of a unit whose worker could not see every read', async () => {
    attempts.set('m1', [
      createWithReach(record =>
        record.kind === 'finish' ? { ...record, tracked: false } : record,
      ),
    ])
    let result = await runIsolated(createHandle(), { units: [createUnit()] })

    expect(result.units).toMatchObject([{ reached: true, inputs: null }])
  })

  describe('reads of a transformer that no dry run made', () => {
    /**
     * Builds what a unit with a reach and a passing test left behind when the
     * transformers read some files.
     *
     * @param transforms - What they read.
     * @param outcome - What the unit left behind otherwise.
     * @returns What it left behind.
     */
    function createTransformed(
      transforms: string[],
      outcome = createPass(),
    ): UnitOutcome {
      return {
        ...outcome,
        records: outcome.records.map(record =>
          record.kind === 'finish' ? { ...record, transforms } : record,
        ),
      }
    }

    it('join what every unit of the plan depended on, as a warm worker transforms a module once', async () => {
      let handle = createHandle()
      handle.state.transforms.add('/p/babel.config.js')
      attempts.set('m2', [
        createTransformed(['/p/babel.config.js', '/p/lib/.babelrc']),
      ])
      let result = await runIsolated(handle, {
        units: [createUnit(), createUnit({ mutant: 'm2' })],
      })
      let dependencies = [
        '/p/__snapshots__/a.test.js.snap',
        '/p/a.test.js',
        '/p/lib/.babelrc',
        '/p/package.json',
        '/package.json',
      ]

      expect(result.units.map(unit => unit.inputs?.dependencies)).toStrictEqual(
        [dependencies, dependencies],
      )
      expect(handle.state.lateTransforms).toStrictEqual(
        new Set(['/p/lib/.babelrc']),
      )
    })

    it('reach the units of later plans, where the disk cache of Jest may spare the transformer', async () => {
      let handle = createHandle()
      attempts.set('m1', [createTransformed(['/p/lib/.babelrc'])])
      await runIsolated(handle, { units: [createUnit()] })
      let result = await runIsolated(handle, {
        units: [createUnit({ mutant: 'm2', file: other })],
      })

      expect(result.units[0]!.inputs!.dependencies).toContain('/p/lib/.babelrc')
    })

    it('count in a unit with no facts that ended', async () => {
      attempts.set('m1', [
        createTransformed(['/p/lib/.babelrc'], createFlake()),
      ])
      let result = await runIsolated(createHandle(), {
        units: [createUnit(), createUnit({ mutant: 'm2' })],
      })

      expect(result.units.map(unit => unit.unit)).toStrictEqual([1])
      expect(result.units[0]!.inputs!.dependencies).toContain('/p/lib/.babelrc')
    })

    it('give no inputs to a unit whose worker could not see every read', async () => {
      attempts.set('m1', [
        createTransformed(
          ['/p/lib/.babelrc'],
          createWithReach(record =>
            record.kind === 'finish' ? { ...record, tracked: false } : record,
          ),
        ),
      ])
      let result = await runIsolated(createHandle(), { units: [createUnit()] })

      expect(result.units).toMatchObject([{ inputs: null }])
    })
  })

  it('leaves out the units with no facts', async () => {
    attempts.set('m1', [createExit()])
    attempts.set('m3', [createExit()])
    let result = await runIsolated(createHandle(), {
      units: [
        createUnit(),
        createUnit({ mutant: 'm2' }),
        createUnit({ mutant: 'm3' }),
      ],
    })

    expect(result.units.map(unit => unit.unit)).toStrictEqual([1])
  })

  it('tells the context once per unit, as the unit ends, with the facts when there are any', async () => {
    let onUnitEnd = vi.fn<(end?: UnitEnd) => void>()
    let handle = createHandle()
    handle.context.onUnitEnd = onUnitEnd
    attempts.set('m1', [createExit()])
    let result = await runIsolated(handle, {
      units: [createUnit(), createUnit({ mutant: 'm2' })],
    })

    expect(onUnitEnd.mock.calls).toStrictEqual([
      [{ unit: 0 }],
      [{ facts: result.units[0], unit: 1 }],
    ])
  })

  it('runs without a context that listens', async () => {
    attempts.set('m1', [createExit()])

    await expect(
      runIsolated(createHandle(), {
        units: [createUnit(), createUnit({ mutant: 'm2' })],
      }),
    ).resolves.toMatchObject({ units: [{ unit: 1 }] })
  })

  it.each<[string, () => UnitOutcome]>([
    ['that exited', createExit],
    ['that ended', createFlake],
  ])(
    'discards the worker of a unit with no facts %s, and only that one',
    async (_name, createOutcome) => {
      attempts.set('m1', [createOutcome()])
      await runIsolated(createHandle(), {
        units: [createUnit(), createUnit({ mutant: 'm2' })],
      })

      expect(
        sent
          .filter(entry => entry.unit.mutant !== null)
          .map(entry => entry.discarded),
      ).toStrictEqual([true, false])
    },
  )

  it('runs in the pool with its size, and never two units of one file at once', async () => {
    let running = new Set<string>()
    let most = 0
    let overlaps = 0
    vi.mocked(runOnWorker).mockImplementation(async (_pool, _slot, input) => {
      overlaps += Number(running.has(input.unit.file))
      running.add(input.unit.file)
      most = Math.max(most, running.size)
      await new Promise(resolve => {
        setImmediate(resolve)
      })
      running.delete(input.unit.file)
      return createPass()
    })
    await runIsolated(createHandle({ pool: createPool(2) }), {
      units: [
        createUnit(),
        createUnit({ mutant: 'm2' }),
        createUnit({ mutant: 'm3', file: other }),
        createUnit({ file: '/p/c.test.js', mutant: 'm4' }),
      ],
    })

    expect(most).toBe(2)
    expect(overlaps).toBe(0)
  })

  it('keeps the plan order of the units of one file', async () => {
    await runIsolated(createHandle({ pool: createPool(2) }), {
      units: [
        createUnit(),
        createUnit({ mutant: 'm2' }),
        createUnit({ mutant: 'm3' }),
      ],
    })

    expect(log).toStrictEqual(['drain', 'm1', 'm2', 'm3'])
  })

  it('rejects when a unit cannot run, with the slot free', async () => {
    vi.mocked(runOnWorker).mockRejectedValue(new Error('the pool is closed'))
    let handle = createHandle()

    await expect(
      runIsolated(handle, { units: [createUnit()] }),
    ).rejects.toThrow('the pool is closed')
    expect(handle.pool.take().index).toBe(1)
  })

  describe('chains', () => {
    it('start every plan on a drained pool, with no retry too', async () => {
      let handle = createHandle()
      await runIsolated(handle, { units: [createUnit()] })
      await runIsolated(handle, { units: [createUnit({ mutant: 'm2' })] })

      expect(log).toStrictEqual(['drain', 'm1', 'drain', 'm2'])
    })

    it('run the units of a file together, in plan order, whatever comes between them', async () => {
      await runIsolated(createHandle(), {
        units: [
          createUnit(),
          createUnit({ mutant: 'm2', file: other }),
          createUnit({ mutant: 'm3' }),
          createUnit({ mutant: 'm4', file: other }),
        ],
      })

      expect(log).toStrictEqual(['drain', 'm1', 'm3', 'm2', 'm4'])
    })

    it('hold one slot for the units of a file and their check, and another chain another', async () => {
      attempts.set('m1', [createKill()])
      attempts.set('m3', [createKill()])
      checks.set(file, [createKill('warm state'), createPass()])
      vi.mocked(runOnWorker).mockImplementation(
        async (_pool, slot, { clean, unit }) => {
          await new Promise(resolve => {
            setImmediate(resolve)
          })
          let list =
            unit.mutant === null ?
              (checks.get(unit.file) ?? [createPass()])
            : (attempts.get(unit.mutant) ?? [createPass()])
          sent.push({
            slot: slot.index,
            discarded: false,
            clean,
            unit,
          })
          return list.length > 1 ? list.shift()! : list[0]!
        },
      )
      await runIsolated(createHandle({ pool: createPool(2) }), {
        units: [
          createUnit(),
          createUnit({ mutant: 'm2' }),
          createUnit({ mutant: 'm3', file: other }),
          createUnit({ mutant: 'm4', file: other }),
        ],
      })

      expect(
        sent
          .filter(entry => entry.unit.file === file)
          .map(entry => [entry.unit.mutant, entry.clean, entry.slot]),
      ).toStrictEqual([
        ['m1', false, 1],
        ['m2', false, 1],
        [null, false, 1],
        [null, true, 1],
      ])
      expect(
        sent
          .filter(entry => entry.unit.file === other)
          .map(entry => [entry.unit.mutant, entry.slot]),
      ).toStrictEqual([
        ['m3', 2],
        ['m4', 2],
        [null, 2],
      ])
    })

    it('take the slot a chain freed', async () => {
      await runIsolated(createHandle({ pool: createPool(2) }), {
        units: [createUnit(), createUnit({ mutant: 'm2', file: other })],
      })

      expect(sent.map(entry => entry.slot)).toStrictEqual([1, 2])

      sent = []
      await runIsolated(createHandle(), {
        units: [createUnit(), createUnit({ mutant: 'm2', file: other })],
      })

      expect(sent.map(entry => entry.slot)).toStrictEqual([1, 1])
    })

    it('hold one key for one file in two projects', async () => {
      let running = 0
      let most = 0
      vi.mocked(runOnWorker).mockImplementation(async () => {
        running += 1
        most = Math.max(most, running)
        await new Promise(resolve => {
          setImmediate(resolve)
        })
        running -= 1
        return createPass()
      })
      await runIsolated(
        createHandle({
          projects: [createProject('unit'), createProject('lint')],
          pool: createPool(2),
        }),
        {
          units: [
            createUnit({ project: 'unit' }),
            createUnit({ project: 'lint' }),
          ],
        },
      )

      expect(most).toBe(1)
    })

    it('stop the run at the check that fails, with no other chain started', async () => {
      attempts.set('m1', [createKill()])
      checks.set(file, [createKill('wrong')])
      let handle = createHandle()

      await expect(
        runIsolated(handle, {
          units: [createUnit(), createUnit({ mutant: 'm2', file: other })],
        }),
      ).rejects.toThrow(/^a\.test\.js fails when it runs again/u)
      expect(log).toStrictEqual(['drain', 'm1', file, file])
      expect(handle.pool.take().index).toBe(1)
    })
  })

  describe('retries', () => {
    it('run first in their chain, as clean attempts, ahead of the plan order', async () => {
      let handle = createHandle()
      handle.state.noFacts.add(createKey({ mutant: 'm2' }))
      handle.state.noFacts.add(createKey({ mutant: 'm5' }))
      handle.state.noFacts.add(createKey({ mutant: 'm3', file: other }))
      let result = await runIsolated(handle, {
        units: [
          createUnit(),
          createUnit({ mutant: 'm5' }),
          createUnit({ mutant: 'm2' }),
          createUnit({ mutant: 'm3', file: other }),
          createUnit({ mutant: 'm4' }),
        ],
      })

      expect(log).toStrictEqual(['drain', 'm5', 'm2', 'm1', 'm4', 'm3'])
      expect(sent.map(entry => entry.clean)).toStrictEqual([
        true,
        true,
        false,
        false,
        true,
      ])
      expect(
        result.units
          .map(unit => unit.unit)
          .toSorted((left, right) => left - right),
      ).toStrictEqual([0, 1, 2, 3, 4])
    })

    it('never overlap a unit of their file, as one chain runs them', async () => {
      let handle = createHandle({ pool: createPool(2) })
      handle.state.noFacts.add(createKey({ mutant: 'm2' }))
      let running = new Set<string>()
      let overlaps = 0
      vi.mocked(runOnWorker).mockImplementation(async (_pool, _slot, input) => {
        overlaps += Number(running.has(input.unit.file))
        running.add(input.unit.file)
        await new Promise(resolve => {
          setImmediate(resolve)
        })
        running.delete(input.unit.file)
        return createPass()
      })
      await runIsolated(handle, {
        units: [createUnit(), createUnit({ mutant: 'm2' })],
      })

      expect(overlaps).toBe(0)
    })

    it.each<[string, () => UnitOutcome]>([
      ['exited', createExit],
      ['ended', createFlake],
    ])(
      'are the keys that %s with no facts, and only those',
      async (_name, createOutcome) => {
        let handle = createHandle()
        attempts.set('m1', [createOutcome(), createOutcome()])
        await runIsolated(handle, {
          units: [createUnit(), createUnit({ mutant: 'm2' })],
        })

        expect(
          sent
            .filter(entry => entry.unit.mutant !== null)
            .map(entry => entry.clean),
        ).toStrictEqual([false, false])
        expect([...handle.state.noFacts]).toStrictEqual([createKey()])

        sent = []
        await runIsolated(handle, {
          units: [
            createUnit(),
            createUnit({ mutant: 'm2' }),
            createUnit({ file: other }),
          ],
        })

        expect(
          sent
            .filter(entry => entry.unit.mutant !== null)
            .map(entry => [entry.unit.mutant, entry.unit.file, entry.clean]),
        ).toStrictEqual([
          ['m1', file, true],
          ['m2', file, false],
          ['m1', other, false],
        ])
      },
    )

    it('keep the keys of a test file in two projects apart', async () => {
      let handle = createHandle({
        projects: [createProject('unit'), createProject('lint')],
      })
      attempts.set('m1', [createExit(), createPass()])
      await runIsolated(handle, { units: [createUnit({ project: 'unit' })] })
      sent = []
      await runIsolated(handle, {
        units: [
          createUnit({ project: 'lint' }),
          createUnit({ project: 'unit' }),
        ],
      })

      expect(
        sent
          .filter(entry => entry.unit.mutant !== null)
          .map(entry => [entry.unit.project, entry.clean]),
      ).toStrictEqual([
        ['id-unit', true],
        ['id-lint', false],
      ])
    })

    it('read the exit of a unit that had no facts as a crash, which says nothing of what it read', async () => {
      let handle = createHandle()
      attempts.set('m1', [createExit()])

      await expect(
        runIsolated(handle, { units: [createUnit()] }),
      ).resolves.toStrictEqual({ units: [] })

      await expect(
        runIsolated(handle, { units: [createUnit()] }),
      ).resolves.toMatchObject({
        units: [{ incomplete: 'crash', reached: true, inputs: null }],
      })
    })

    it('keep a key that gave facts when it runs again', async () => {
      let handle = createHandle()
      attempts.set('m1', [createExit(), createPass()])
      let units = [createUnit()]
      await runIsolated(handle, { units })
      await runIsolated(handle, { units })
      await runIsolated(handle, { units })

      expect(
        sent
          .filter(entry => entry.unit.mutant !== null)
          .map(entry => entry.clean),
      ).toStrictEqual([false, true, true])
    })

    it.each<[string, Partial<Extract<JestTimedRecord, { kind: 'finish' }>>]>([
      ['an error outside any test', { execError: 'outside' }],
      [
        'a failure of the host realm',
        { outcome: 'failure', realm: 'host', message: 'm' },
      ],
    ])('read %s as a fact only when clean', async (_name, finish) => {
      let handle = createHandle()
      attempts.set('m1', [
        createWithReach(record =>
          record.kind === 'finish' ? { ...record, ...finish } : record,
        ),
      ])

      await expect(
        runIsolated(handle, { units: [createUnit()] }),
      ).resolves.toStrictEqual({ units: [] })

      await expect(
        runIsolated(handle, { units: [createUnit()] }),
      ).resolves.toMatchObject({ units: [{ reached: true, unit: 0 }] })
    })
  })

  describe('with fresh workers', () => {
    it('makes every attempt clean, of units and of the check', async () => {
      attempts.set('m1', [createKill()])
      await runIsolated(createHandle({ freshWorkers: true }), {
        units: [createUnit(), createUnit({ mutant: 'm2' })],
      })

      expect(log).toStrictEqual(['drain', 'm1', 'm2', file])
      expect(sent.map(({ clean }) => clean)).toStrictEqual([true, true, true])
    })

    it('leaves the facts of its clean units standing when the check fails, then passes', async () => {
      let handle = createHandle({ freshWorkers: true })
      attempts.set('m1', [createKill()])
      checks.set(file, [createKill('a flake'), createPass()])
      let result = await runIsolated(handle, { units: [createUnit()] })

      expect(result.units).toMatchObject([{ tests: [{ failed: true }] }])
      expect([...handle.state.noFacts]).toStrictEqual([])
    })

    it('reads an error outside any test as a fact the first time', async () => {
      attempts.set('m1', [
        createWithReach(record =>
          record.kind === 'finish' ?
            { ...record, execError: 'outside' }
          : record,
        ),
      ])

      await expect(
        runIsolated(createHandle({ freshWorkers: true }), {
          units: [createUnit()],
        }),
      ).resolves.toMatchObject({ units: [{ hookError: 'outside' }] })
    })
  })

  describe('heap cap', () => {
    it('rises when a worker ran out of memory with no reach, and the unit has no facts', async () => {
      let handle = createHandle()
      attempts.set('m1', [createOutOfMemory({ reached: false, cap: 512 })])
      let result = await runIsolated(handle, { units: [createUnit()] })

      expect(handle.heap.current).toBe(1024)
      expect(result.units).toStrictEqual([])
      expect(sent[0]!.discarded).toBe(true)
    })

    it('rises when a worker ran out of memory with a reach, and the unit has no facts', async () => {
      let handle = createHandle()
      attempts.set('m1', [createOutOfMemory({ reached: true, cap: 512 })])
      let result = await runIsolated(handle, { units: [createUnit()] })

      expect(handle.heap.current).toBe(1024)
      expect(result.units).toStrictEqual([])
      expect(sent[0]!.discarded).toBe(true)
    })

    it('stays when no worker ran out of memory', async () => {
      let handle = createHandle()
      attempts.set('m1', [createExit()])
      await runIsolated(handle, { units: [createUnit()] })

      expect(handle.heap.current).toBe(512)
    })

    it('runs the next try of that unit as a clean attempt', async () => {
      let handle = createHandle()
      attempts.set('m1', [
        createOutOfMemory({ reached: true, cap: 512 }),
        createPass(),
      ])
      await runIsolated(handle, { units: [createUnit()] })
      await runIsolated(handle, { units: [createUnit()] })

      expect(
        sent
          .filter(entry => entry.unit.mutant !== null)
          .map(entry => entry.clean),
      ).toStrictEqual([false, true])
    })
  })

  describe('check', () => {
    it.each<[string, () => UnitOutcome]>([
      ['a flake with no reach', createFlake],
      ['an exit that gives no facts', createExit],
      [
        'a hang',
        () => ({
          ...createExit(),
          signal: 'SIGKILL',
          hung: true,
          code: null,
        }),
      ],
      [
        'a load error',
        () =>
          createWithReach(record => {
            if (record.kind === 'load') {
              return null
            }
            return record.kind === 'finish' ?
                { ...record, message: 'no module', outcome: 'failure' }
              : record
          }),
      ],
      [
        'an error outside any test',
        () =>
          createWithReach(record =>
            record.kind === 'finish' ?
              { ...record, execError: 'outside' }
            : record,
          ),
      ],
      [
        'a hook that failed',
        () => {
          let outcome = createPass()
          let hook: JestTimedRecord = {
            message: 'the hook broke',
            type: 'afterAll',
            timedOut: false,
            kind: 'hook',
            time: 45,
          }
          return {
            ...outcome,
            records: [
              ...outcome.records.slice(0, -1),
              hook,
              outcome.records.at(-1)!,
            ],
          }
        },
      ],
      [
        'a hook that timed out',
        () => {
          let outcome = createPass()
          let hook: JestTimedRecord = {
            message: 'Exceeded timeout',
            type: 'afterAll',
            timedOut: true,
            kind: 'hook',
            time: 45,
          }
          return {
            ...outcome,
            records: [
              ...outcome.records.slice(0, -1),
              hook,
              outcome.records.at(-1)!,
            ],
          }
        },
      ],
      [
        'hits above the limit',
        () =>
          createWithReach(record =>
            record.kind === 'finish' ? { ...record, hits: 1001 } : record,
          ),
      ],
      ['a failed test', createKill],
      [
        'a test that timed out',
        () =>
          createWithReach(record =>
            record.kind === 'try' ? { ...record, timedOut: true } : record,
          ),
      ],
      [
        'a worker out of memory',
        () => createOutOfMemory({ reached: true, cap: 512 }),
      ],
    ])('runs for %s, after the units', async (_name, createOutcome) => {
      attempts.set('m1', [createOutcome()])
      await runIsolated(createHandle(), {
        units: [createUnit(), createUnit({ mutant: 'm2' })],
      })

      expect(log).toStrictEqual(['drain', 'm1', 'm2', file])
      expect(sent.at(-1)!.unit).toMatchObject({
        project: 'id-',
        mutant: null,
        file,
      })
    })

    it('runs for a crash on a clean attempt', async () => {
      let handle = createHandle()
      attempts.set('m1', [createExit()])
      handle.state.noFacts.add(createKey())
      let result = await runIsolated(handle, { units: [createUnit()] })

      expect(result.units).toMatchObject([{ incomplete: 'crash' }])
      expect(log).toStrictEqual(['drain', 'm1', file])
    })

    it('does not run after a clean pass, with a reach or without', async () => {
      attempts.set('m1', [createPass()])
      attempts.set('m2', [
        createWithReach(record => (record.kind === 'reached' ? null : record)),
      ])
      await runIsolated(createHandle(), {
        units: [createUnit(), createUnit({ mutant: 'm2' })],
      })

      expect(log).toStrictEqual(['drain', 'm1', 'm2'])
    })

    it('runs only for the files with evidence, each once per plan', async () => {
      attempts.set('m1', [createKill()])
      attempts.set('m2', [createKill()])
      await runIsolated(createHandle(), {
        units: [
          createUnit(),
          createUnit({ mutant: 'm2' }),
          createUnit({ mutant: 'm3', file: other }),
        ],
      })

      expect(log).toStrictEqual(['drain', 'm1', 'm2', file, 'm3'])
    })

    it('runs again in the next plan, for what a later kill leaves', async () => {
      let handle = createHandle()
      attempts.set('m1', [createKill()])
      attempts.set('m2', [createKill()])
      await runIsolated(handle, { units: [createUnit()] })
      log = []
      await runIsolated(handle, { units: [createUnit({ mutant: 'm2' })] })

      expect(log).toStrictEqual(['drain', 'm2', file])
    })

    it('takes the same file in two projects for two keys', async () => {
      let handle = createHandle({
        projects: [createProject('unit'), createProject('lint')],
      })
      attempts.set('m1', [createKill()])
      await runIsolated(handle, {
        units: [
          createUnit({ project: 'unit' }),
          createUnit({ project: 'lint' }),
          createUnit({ project: 'unit', mutant: 'm2' }),
        ],
      })

      expect(
        sent
          .filter(entry => entry.unit.mutant === null)
          .map(entry => entry.unit.project),
      ).toStrictEqual(['id-unit', 'id-lint'])
    })

    it('tells the context of a unit before it runs', async () => {
      let order: string[] = []
      let handle = createHandle()
      handle.context.onUnitEnd = () => {
        order.push(`end after ${log.length}`)
      }
      attempts.set('m1', [createKill()])
      await runIsolated(handle, { units: [createUnit()] })

      expect(order).toStrictEqual(['end after 2'])
      expect(log).toStrictEqual(['drain', 'm1', file])
    })

    it('keeps every fact after a first attempt that passes, with no second', async () => {
      let handle = createHandle()
      attempts.set('m1', [createKill()])
      let result = await runIsolated(handle, {
        units: [createUnit(), createUnit({ mutant: 'm2' })],
      })

      expect(log).toStrictEqual(['drain', 'm1', 'm2', file])
      expect(result.units.map(unit => unit.unit)).toStrictEqual([0, 1])
      expect([...handle.state.noFacts]).toStrictEqual([])
    })

    it('takes back every warm unit of a file that fails, then passes clean, passes too, as what failed it may have let a mutant pass', async () => {
      let handle = createHandle()
      handle.state.noFacts.add(createKey({ mutant: 'retried' }))
      attempts.set('retried', [createKill()])
      attempts.set('killed', [createKill()])
      attempts.set('elsewhere', [createKill()])
      checks.set(file, [createKill('warm state'), createPass()])
      let result = await runIsolated(handle, {
        units: [
          createUnit({ mutant: 'killed' }),
          createUnit({ mutant: 'retried' }),
          createUnit({ mutant: 'passed' }),
          createUnit({ mutant: 'elsewhere', file: other }),
        ],
      })

      expect(log).toStrictEqual([
        'drain',
        'retried',
        'killed',
        'passed',
        file,
        file,
        'elsewhere',
        other,
      ])
      expect(
        result.units
          .map(unit => unit.unit)
          .toSorted((left, right) => left - right),
      ).toStrictEqual([1, 3])
      expect([...handle.state.noFacts]).toStrictEqual([
        createKey({ mutant: 'retried' }),
        createKey({ mutant: 'killed' }),
        createKey({ mutant: 'passed' }),
      ])
    })

    it('runs what it took back clean in the next plan, where it stands', async () => {
      let handle = createHandle()
      attempts.set('m1', [createKill()])
      checks.set(file, [createKill('warm state'), createPass()])

      await expect(
        runIsolated(handle, { units: [createUnit()] }),
      ).resolves.toStrictEqual({ units: [] })

      log = []
      sent = []
      checks.set(file, [createKill('warm state'), createPass()])
      let result = await runIsolated(handle, { units: [createUnit()] })

      expect(log).toStrictEqual(['drain', 'm1', file, file])
      expect(sent[0]!.clean).toBe(true)
      expect(result.units).toMatchObject([{ tests: [{ failed: true }] }])
    })

    it('takes back the warm units of the file in every project, as they ran on the worker the check found', async () => {
      let handle = createHandle({
        projects: [createProject('unit'), createProject('lint')],
      })
      attempts.set('m1', [createKill()])
      vi.mocked(runOnWorker).mockImplementation((_pool, _slot, input) => {
        let failsFirst =
          input.unit.mutant === null &&
          input.unit.project === 'id-unit' &&
          !input.clean
        return Promise.resolve(
          failsFirst || input.unit.mutant === 'm1' ?
            createKill()
          : createPass(),
        )
      })
      let result = await runIsolated(handle, {
        units: [
          createUnit({ project: 'unit' }),
          createUnit({ project: 'lint' }),
        ],
      })

      expect(result.units).toStrictEqual([])
      expect([...handle.state.noFacts]).toStrictEqual([
        createKey({ project: 'unit' }),
        createKey({ project: 'lint' }),
      ])
    })

    it('rejects with the sentence and hands on the text of its file', async () => {
      attempts.set('m1', [createKill()])
      checks.set(other, [createKill('wrong in b')])
      let chunks: [string, string | null][] = []
      let handle = createHandle()
      handle.context.onOutput = (text, from) => {
        chunks.push([text, from])
      }

      await expect(
        runIsolated(handle, {
          units: [createUnit({ file: other }), createUnit({ mutant: 'm2' })],
        }),
      ).rejects.toThrow(
        new Error(
          'b.test.js fails when it runs again without mutants: wrong in b; mootant runs a test file many times in one session, against one global setup, so its tests must not be flaky and must reset what they depend on before they run. A mutant may also have changed or deleted files its tests depend on, such as build output; restore them and keep the code that did it out of runs with an ignore comment.',
        ),
      )
      expect(chunks).toStrictEqual([["Jest's text of wrong in b", other]])
    })
  })
})
