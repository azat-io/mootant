import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import type { JestTimedRecord } from '../../../adapters/jest/types/jest-timed-record'
import type * as UnservedFiles from '../../../adapters/jest/list-unserved-files'
import type { JestConsole } from '../../../adapters/jest/types/jest-console'
import type { UnitOutcome } from '../../../adapters/jest/types/unit-outcome'
import type { JestProject } from '../../../adapters/jest/types/jest-project'
import type { DryRunRequest } from '../../../types/adapter/dry-run-request'
import type { JestHandle } from '../../../adapters/jest/types/jest-handle'
import type { WorkerPool } from '../../../adapters/jest/types/worker-pool'
import type { JestUnit } from '../../../adapters/jest/types/jest-unit'

import { listUnservedFiles } from '../../../adapters/jest/list-unserved-files'
import { createHeapCap } from '../../../adapters/jest/create-heap-cap'
import { runOnWorker } from '../../../adapters/jest/run-on-worker'
import { runDry } from '../../../adapters/jest/run-dry'

vi.mock(import('../../../adapters/jest/run-on-worker'), () => ({
  runOnWorker: vi.fn(),
}))

vi.mock(import('../../../adapters/jest/list-unserved-files'), () => ({
  listUnservedFiles: vi.fn(() => []),
}))

/**
 * Directory of the Jest files of the current test.
 */
let directory = ''

/**
 * Outcomes the attempts of each test file leave, in order; the last one
 * repeats.
 */
let attempts = new Map<string, UnitOutcome[]>()

/**
 * Units sent so far, with whether each is a clean attempt.
 */
let sent: { clean: boolean; unit: JestUnit }[] = []

/**
 * What happened so far, in order: an attempt by its test file, a drained pool.
 */
let log: string[] = []

/**
 * Slots taken and not yet freed.
 */
let held = 0

/**
 * Builds a `finish` record of a clean result.
 *
 * @param fields - Fields that differ.
 * @returns The record.
 */
function createFinish(
  fields: Partial<Extract<JestTimedRecord, { kind: 'finish' }>> = {},
): JestTimedRecord {
  return {
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
    ...fields,
  }
}

/**
 * Builds a `try` record of a passing attempt.
 *
 * @param fields - Fields that differ.
 * @returns The record.
 */
function createTry(
  fields: Partial<Extract<JestTimedRecord, { kind: 'try' }>> = {},
): JestTimedRecord {
  return {
    timedOut: false,
    reached: false,
    failed: false,
    occurrence: 0,
    message: null,
    covers: null,
    realm: null,
    duration: 0,
    kind: 'try',
    name: 'a',
    time: 50,
    hits: 0,
    ...fields,
  }
}

/**
 * The record of a framework mootant can follow.
 */
let load: JestTimedRecord = { kind: 'load', covers: [], time: 40, hits: 0 }

/**
 * Creates a session handle.
 *
 * @param fields - Fields that differ.
 * @returns Handle with one nameless project and two test files, and a console
 *   that keeps what tests print in every project.
 */
function createHandle(fields: Partial<JestHandle> = {}): JestHandle {
  let projects = fields.projects ?? [createProject('')]
  return {
    state: {
      lateTransforms: new Set(),
      transforms: new Set(),
      noFacts: new Set(),
      outside: new Set(),
      reads: new Map(),
      timeouts: null,
      plan: null,
      plans: 0,
      units: 0,
    },
    context: {
      files: [{ file: '/p/src/a.js', switched: 's', original: 'o' }],
      workDirectory: path.dirname(directory),
      concurrency: null,
      root: '/p',
    },
    tests: [
      { path: '/p/b.test.js', project: 'id-' },
      { path: '/p/a.test.js', project: 'id-' },
    ],
    consoles: new Map(
      projects.map(({ name }): [string, JestConsole] => [name, 'buffer']),
    ),
    heap: createHeapCap({ nodeFlags: [], env: {} }),
    freshWorkers: false,
    pool: createPool(),
    root: '/p',
    directory,
    projects,
    ...fields,
  }
}

/**
 * Builds the outcome of a unit that ended cleanly, with a `load` and `finish`.
 *
 * @param finish - Fields of `finish` that differ.
 * @param records - Records before `finish`.
 * @returns What the unit left behind.
 */
function createOutcome(
  finish: Partial<Extract<JestTimedRecord, { kind: 'finish' }>> = {},
  records: JestTimedRecord[] = [],
): UnitOutcome {
  return {
    records: [load, ...records, createFinish(finish)],
    outOfMemory: null,
    signal: null,
    hung: false,
    done: true,
    startup: 0,
    code: null,
  }
}

/**
 * Creates the part of a pool these tests reach.
 *
 * @param size - Number of slots.
 * @returns The pool, whose drain goes to the log and which counts its slots.
 */
function createPool(size = 1): WorkerPool {
  return {
    take() {
      held += 1
      return { worker: null, index: held, busy: true }
    },
    discardAll: () => {
      log.push('drain')
      return Promise.resolve()
    },
    release(_slot) {
      held -= 1
    },
    size,
  } as WorkerPool
}

/**
 * Builds the outcome of a test file that failed as a whole, reading nothing.
 *
 * @param outcome - How it failed.
 * @param message - What it says.
 * @returns What the unit left behind.
 */
function createFailure(
  outcome: 'failure' | 'empty',
  message: string,
): UnitOutcome {
  return {
    records: [createFinish({ outcome, message })],
    outOfMemory: null,
    signal: null,
    hung: false,
    done: true,
    startup: 0,
    code: null,
  }
}

/**
 * Builds a dry-run request.
 *
 * @param fields - Fields that differ.
 * @returns Request of an instrumented dry run of what may load `src/a.js`.
 */
function createRequest(fields: Partial<DryRunRequest> = {}): DryRunRequest {
  return {
    timeouts: { file: 1000, test: 100 },
    related: ['/p/src/a.js'],
    instrumented: true,
    repeat: false,
    files: null,
    ...fields,
  }
}

/**
 * Builds the outcome of a worker that exited without `done`.
 *
 * @param fields - Fields that differ.
 * @returns What the unit left behind.
 */
function createDeath(fields: Partial<UnitOutcome> = {}): UnitOutcome {
  return {
    outOfMemory: null,
    signal: null,
    hung: false,
    done: false,
    records: [],
    startup: 0,
    code: 1,
    ...fields,
  }
}

/**
 * Builds the outcome of a worker that ran out of memory.
 *
 * @param cap - Heap limit of the worker.
 * @returns What the unit left behind.
 */
function createOutOfMemory(cap: number): UnitOutcome {
  return createDeath({ signal: 'SIGABRT', outOfMemory: cap, code: null })
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

/**
 * Builds the clean outcome of a file that read the related file.
 *
 * @returns What the unit left behind.
 */
function createRelated(): UnitOutcome {
  return createOutcome({ reads: ['/p/src/a.js'] })
}

/**
 * Lists the test files of the units sent so far.
 *
 * @returns Their absolute paths, in order.
 */
function listSent(): string[] {
  return sent.map(entry => entry.unit.file)
}

describe('runDry', () => {
  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'mootant-dry-'))
    attempts = new Map()
    sent = []
    log = []
    held = 0
    vi.mocked(runOnWorker).mockImplementation((_pool, _slot, input) => {
      sent.push({ clean: input.clean, unit: input.unit })
      log.push(input.unit.file)
      let list = attempts.get(input.unit.file) ?? [createOutcome()]
      return Promise.resolve(list.length > 1 ? list.shift()! : list[0]!)
    })
  })

  afterEach(async () => {
    vi.mocked(runOnWorker).mockReset()
    vi.mocked(listUnservedFiles).mockReset()
    await rm(directory, { recursive: true, force: true })
  })

  it('rejects a request for every test twice in a row', async () => {
    await expect(
      runDry(createHandle(), createRequest({ repeat: true })),
    ).rejects.toThrow(
      'The jest adapter runs each test once; it cannot try tests twice in a row.',
    )
    expect(sent).toStrictEqual([])
  })

  it('writes a new plan per instrumented run from the files as they are now, and keeps it', async () => {
    let handle = createHandle()
    attempts.set('/p/a.test.js', [createRelated()])
    await runDry(handle, createRequest())
    let first = sent[0]!.unit.plan!

    expect(first).toBe(path.join(directory, 'plans/1/plan.json'))
    expect(handle.state.plan).toBe(first)
    expect(sent[1]!.unit.plan).toBe(first)
    expect(
      Object.keys(JSON.parse(readFileSync(first, 'utf8')) as object),
    ).toStrictEqual(['/p/src/a.js'])

    handle.context.files = [
      { file: '/p/src/b.js', switched: 's', original: 'o' },
    ]
    sent = []
    await runDry(handle, createRequest())
    let second = sent[0]!.unit.plan!

    expect(second).toBe(path.join(directory, 'plans/2/plan.json'))
    expect(handle.state.plan).toBe(second)
    expect(
      Object.keys(JSON.parse(readFileSync(second, 'utf8')) as object),
    ).toStrictEqual(['/p/src/b.js'])
    expect(existsSync(first)).toBe(true)
  })

  it('uses no plan without instrumentation and keeps the plan of the session', async () => {
    let handle = createHandle()
    attempts.set('/p/a.test.js', [createRelated()])
    await runDry(handle, createRequest())
    let { plan } = handle.state
    sent = []
    await runDry(handle, createRequest({ instrumented: false }))

    expect(sent.map(entry => entry.unit.plan)).toStrictEqual([null])
    expect(handle.state.plan).toBe(plan)
    expect(handle.state.plans).toBe(1)
  })

  it('gives each attempt a new out file in an existing directory, with no mutant and no hit limit', async () => {
    attempts.set('/p/a.test.js', [createDeath(), createOutcome()])
    await runDry(createHandle(), createRequest())

    expect(sent.map(entry => entry.unit)).toStrictEqual([
      {
        plan: path.join(directory, 'plans/1/plan.json'),
        out: path.join(directory, 'out/1.jsonl'),
        file: '/p/b.test.js',
        console: 'buffer',
        project: 'id-',
        mutant: null,
      },
      {
        plan: path.join(directory, 'plans/1/plan.json'),
        out: path.join(directory, 'out/2.jsonl'),
        file: '/p/a.test.js',
        console: 'buffer',
        project: 'id-',
        mutant: null,
      },
      {
        plan: path.join(directory, 'plans/1/plan.json'),
        out: path.join(directory, 'out/3.jsonl'),
        file: '/p/a.test.js',
        console: 'buffer',
        project: 'id-',
        mutant: null,
      },
    ])
    expect(existsSync(path.join(directory, 'out'))).toBe(true)
  })

  it('gives the tests of each project the console plain Jest gives them, and a recheck of an attempt the watchdog stopped one that writes at once', async () => {
    let handle = createHandle({
      tests: [
        { path: '/p/hung.test.js', project: 'id-unit' },
        { path: '/p/died.test.js', project: 'id-unit' },
        { path: '/p/heavy.test.js', project: 'id-unit' },
        { path: '/p/stale.test.js', project: 'id-unit' },
        { path: '/p/quiet.test.js', project: 'id-lint' },
      ],
      projects: [createProject('unit'), createProject('lint')],
    })
    handle.consoles = new Map([
      ['unit', 'buffer'],
      ['lint', 'none'],
    ])
    attempts.set('/p/hung.test.js', [
      createDeath({ signal: 'SIGKILL', hung: true, code: null }),
      createOutcome(),
    ])
    attempts.set('/p/died.test.js', [createDeath(), createOutcome()])
    attempts.set('/p/heavy.test.js', [createOutOfMemory(512), createOutcome()])
    attempts.set('/p/stale.test.js', [
      createOutcome({}, [{ kind: 'stale', message: 'm', time: 1 }]),
      createOutcome(),
    ])
    await runDry(handle, createRequest())

    expect(
      sent.map(({ unit }) => [path.basename(unit.file), unit.console]),
    ).toStrictEqual([
      ['hung.test.js', 'buffer'],
      ['died.test.js', 'buffer'],
      ['heavy.test.js', 'buffer'],
      ['stale.test.js', 'buffer'],
      ['quiet.test.js', 'none'],
      ['hung.test.js', 'stream'],
      ['died.test.js', 'buffer'],
      ['heavy.test.js', 'buffer'],
      ['stale.test.js', 'buffer'],
    ])
  })

  it('names what no project transforms in an instrumented run, from the files of the context', async () => {
    let actual = await vi.importActual<typeof UnservedFiles>(
      '../../../adapters/jest/list-unserved-files',
    )
    vi.mocked(listUnservedFiles).mockImplementation(actual.listUnservedFiles)
    let file = path.join(directory, 'vendor/words.js')
    mkdirSync(path.dirname(file))
    writeFileSync(file, '')
    let project = {
      config: { transformIgnorePatterns: ['/vendor/'], id: 'id-' },
      name: '',
    } as JestProject
    let handle = createHandle({ projects: [project] })
    handle.context.files = [{ original: 'o', switched: 's', file }]

    await expect(runDry(handle, createRequest())).resolves.toMatchObject({
      unserved: [
        {
          reason:
            "the Jest configuration's transformIgnorePatterns keeps it out of the transform",
          file,
        },
      ],
    })
    await expect(
      runDry(handle, createRequest({ instrumented: false })),
    ).resolves.toMatchObject({ unserved: [] })
  })

  it('takes the deadline from the budgets of the request', async () => {
    await runDry(createHandle(), createRequest())
    let [, , { deadline }] = vi.mocked(runOnWorker).mock.calls[0]!

    expect(deadline([], 5)).toBe(1005)
  })

  it('keeps the budgets of the last request for the session', async () => {
    let handle = createHandle()
    await runDry(handle, createRequest({ timeouts: { file: 7, test: 8 } }))

    expect(handle.state.timeouts).toStrictEqual({ file: 7, test: 8 })

    await runDry(handle, createRequest({ timeouts: { file: 9, test: 1 } }))

    expect(handle.state.timeouts).toStrictEqual({ file: 9, test: 1 })
  })

  it('makes every first attempt clean with fresh workers', async () => {
    await runDry(createHandle({ freshWorkers: true }), createRequest())

    expect(sent.map(entry => entry.clean)).toStrictEqual([true, true])
  })

  it('holds a slot for an attempt, and only for that', async () => {
    let handle = createHandle({
      tests: [{ path: '/p/a.test.js', project: 'id-' }],
    })
    let during: number[] = []
    vi.mocked(runOnWorker).mockImplementation(() => {
      during.push(held)
      return Promise.resolve(createOutcome())
    })
    await runDry(handle, createRequest())

    expect(during).toStrictEqual([1])
    expect(held).toBe(0)
  })

  it('frees the slot of an attempt that cannot run', async () => {
    vi.mocked(runOnWorker).mockRejectedValue(new Error('the pool is closed'))

    await expect(runDry(createHandle(), createRequest())).rejects.toThrow(
      'the pool is closed',
    )
    expect(held).toBe(0)
  })

  it('asks to discard the worker of what needs a recheck, and of nothing else', async () => {
    await runDry(createHandle(), createRequest())
    let [, , { discardWhen }] = vi.mocked(runOnWorker).mock.calls[0]!

    expect(discardWhen(createOutcome())).toBe(false)
    expect(discardWhen(createDeath())).toBe(true)
    expect(
      discardWhen(
        createOutcome({}, [{ kind: 'stale', message: 'm', time: 1 }]),
      ),
    ).toBe(true)
    expect(discardWhen(createOutcome({ execError: 'outside' }))).toBe(true)
  })

  it('runs given files only, by the name of their project, and reports them whatever they read', async () => {
    let handle = createHandle({
      projects: [createProject('unit'), createProject('lint')],
    })
    let result = await runDry(
      handle,
      createRequest({
        files: [
          { file: '/p/c.test.js', project: 'lint' },
          { file: '/p/c.test.js', project: 'unit' },
        ],
      }),
    )

    expect(sent.map(entry => entry.unit.project)).toStrictEqual([
      'id-lint',
      'id-unit',
    ])
    expect(result.files.map(file => [file.file, file.project])).toStrictEqual([
      ['/p/c.test.js', 'lint'],
      ['/p/c.test.js', 'unit'],
    ])
  })

  it('runs every test file first, then those with no reads and those whose reads hold a related file', async () => {
    let handle = createHandle({
      tests: [
        { path: '/p/related.test.js', project: 'id-' },
        { path: '/p/unrelated.test.js', project: 'id-' },
        { path: '/p/died.test.js', project: 'id-' },
      ],
    })
    attempts.set('/p/related.test.js', [createRelated()])
    attempts.set('/p/died.test.js', [createDeath()])
    await runDry(handle, createRequest())

    expect(listSent()).toStrictEqual([
      '/p/related.test.js',
      '/p/unrelated.test.js',
      '/p/died.test.js',
      '/p/died.test.js',
    ])

    sent = []
    await runDry(handle, createRequest())

    expect(listSent()).toStrictEqual([
      '/p/related.test.js',
      '/p/died.test.js',
      '/p/died.test.js',
    ])

    sent = []
    attempts.set('/p/died.test.js', [createOutcome()])
    await runDry(handle, createRequest())
    sent = []
    await runDry(handle, createRequest())

    expect(listSent()).toStrictEqual(['/p/related.test.js'])
  })

  it('forgets the reads of a file that later left no finish, so it runs again', async () => {
    let file = '/p/a.test.js'
    let handle = createHandle({ tests: [{ project: 'id-', path: file }] })
    attempts.set(file, [createOutcome(), createDeath()])
    await runDry(handle, createRequest())
    sent = []
    await runDry(handle, createRequest())

    expect(sent).toStrictEqual([])

    await runDry(handle, createRequest({ files: [{ project: '', file }] }))
    attempts.set(file, [createOutcome()])
    sent = []
    await runDry(handle, createRequest())

    expect(listSent()).toStrictEqual([file])
  })

  it('keeps what the transformers read in every attempt that counts, over the dry runs of the session', async () => {
    let handle = createHandle()
    attempts.set('/p/a.test.js', [
      createOutcome({ transforms: ['/p/src/.babelrc'] }, [
        { message: 'old', kind: 'stale', time: 1 },
      ]),
      createOutcome({ transforms: ['/p/tsconfig.json'] }),
      createOutcome({ transforms: ['/p/babel.config.json'] }),
    ])
    attempts.set('/p/b.test.js', [
      createOutcome({ transforms: ['/p/tsconfig.json', '/p/babel.config.js'] }),
    ])
    await runDry(handle, createRequest())

    expect([...handle.state.transforms].toSorted()).toStrictEqual([
      '/p/babel.config.js',
      '/p/tsconfig.json',
    ])

    await runDry(
      handle,
      createRequest({ files: [{ file: '/p/a.test.js', project: '' }] }),
    )

    expect([...handle.state.transforms].toSorted()).toStrictEqual([
      '/p/babel.config.js',
      '/p/babel.config.json',
      '/p/tsconfig.json',
    ])
  })

  it('takes the related files of each request for the file reads kept', async () => {
    let handle = createHandle()
    attempts.set('/p/a.test.js', [createRelated()])
    await runDry(handle, createRequest())
    sent = []
    await runDry(handle, createRequest({ related: ['/p/src/other.js'] }))

    expect(sent).toStrictEqual([])
  })

  it('keeps the state of a test file in two projects apart', async () => {
    let handle = createHandle({
      tests: [
        { path: '/p/a.test.js', project: 'id-unit' },
        { path: '/p/a.test.js', project: 'id-lint' },
      ],
      projects: [createProject('unit'), createProject('lint')],
    })
    vi.mocked(runOnWorker).mockImplementation((_pool, _slot, input) => {
      sent.push({ clean: input.clean, unit: input.unit })
      return Promise.resolve(
        input.unit.project === 'id-unit' ? createRelated() : createOutcome(),
      )
    })
    await runDry(handle, createRequest())

    expect(sent.map(entry => entry.unit.project)).toStrictEqual([
      'id-unit',
      'id-lint',
    ])

    sent = []
    await runDry(handle, createRequest())

    expect(sent.map(entry => entry.unit.project)).toStrictEqual(['id-unit'])
  })

  describe('recheck', () => {
    it.each<[string, UnitOutcome]>([
      ['no done', createDeath()],
      [
        'a stale record',
        createOutcome({}, [{ kind: 'stale', message: 'm', time: 1 }]),
      ],
      [
        'a tracker error',
        createOutcome({}, [
          { kind: 'tracker-error', message: 'm', event: 'e', time: 1 },
        ]),
      ],
      [
        'a failed try that is stale',
        createOutcome({}, [createTry({ realm: 'stale', failed: true })]),
      ],
      [
        'a failure that is stale',
        createOutcome({ outcome: 'failure', realm: 'stale' }),
      ],
      [
        'a failed try of the host realm',
        createOutcome({}, [createTry({ realm: 'host', failed: true })]),
      ],
      [
        'a failure of the host realm',
        createOutcome({ outcome: 'failure', realm: 'host' }),
      ],
      ['an execError', createOutcome({ execError: 'outside' })],
    ])(
      'runs a file once more as a clean attempt on a drained pool for %s',
      async (_name, outcome) => {
        let file = '/p/a.test.js'
        let onUnitEnd = vi.fn<() => void>()
        let handle = createHandle({
          context: {
            ...createHandle().context,
            onUnitEnd,
          },
          tests: [{ project: 'id-', path: file }],
        })
        attempts.set(file, [outcome, createRelated()])
        let result = await runDry(handle, createRequest())

        expect(log).toStrictEqual([file, 'drain', file])
        expect(sent.map(entry => entry.clean)).toStrictEqual([false, true])
        expect(onUnitEnd).toHaveBeenCalledExactlyOnceWith()
        expect(result.files[0]).toMatchObject({ loadFailed: false, errors: [] })
      },
    )

    it('comes after the first attempts of every file, for those that need it, and once', async () => {
      let handle = createHandle({
        tests: [
          { path: '/p/died.test.js', project: 'id-' },
          { path: '/p/passed.test.js', project: 'id-' },
          { path: '/p/stale.test.js', project: 'id-' },
        ],
        pool: createPool(2),
      })
      attempts.set('/p/died.test.js', [createDeath(), createRelated()])
      attempts.set('/p/stale.test.js', [
        createOutcome({}, [{ kind: 'stale', message: 'm', time: 1 }]),
        createRelated(),
      ])
      let result = await runDry(handle, createRequest())

      expect(log).toStrictEqual([
        '/p/died.test.js',
        '/p/passed.test.js',
        '/p/stale.test.js',
        'drain',
        '/p/died.test.js',
        '/p/stale.test.js',
      ])
      expect(result.files.map(file => file.file)).toStrictEqual([
        '/p/died.test.js',
        '/p/stale.test.js',
      ])
    })

    it('never drains the pool when no file needs it', async () => {
      await runDry(createHandle(), createRequest())

      expect(log).toStrictEqual(['/p/b.test.js', '/p/a.test.js'])
    })

    it('keeps two rechecks of one file apart, in the pool with its size', async () => {
      let handle = createHandle({
        tests: [
          { path: '/p/a.test.js', project: 'id-unit' },
          { path: '/p/a.test.js', project: 'id-lint' },
          { path: '/p/b.test.js', project: 'id-unit' },
        ],
        projects: [createProject('unit'), createProject('lint')],
        pool: createPool(2),
      })
      let running = new Set<string>()
      let most = 0
      let overlaps = 0
      vi.mocked(runOnWorker).mockImplementation(async (_pool, _slot, input) => {
        if (input.clean) {
          overlaps += Number(running.has(input.unit.file))
          running.add(input.unit.file)
          most = Math.max(most, running.size)
          await new Promise(resolve => {
            setImmediate(resolve)
          })
          running.delete(input.unit.file)
          return createOutcome()
        }
        return createDeath()
      })
      await runDry(handle, createRequest())

      expect(most).toBe(2)
      expect(overlaps).toBe(0)
    })

    it('rechecks once, and only the last attempt counts', async () => {
      let file = '/p/a.test.js'
      let handle = createHandle({ tests: [{ project: 'id-', path: file }] })
      attempts.set(file, [createDeath({ code: 2 }), createDeath({ code: 3 })])
      let result = await runDry(handle, createRequest())

      expect(sent.map(entry => entry.clean)).toStrictEqual([false, true])
      expect(result.files[0]!.errors).toStrictEqual([
        'The test process exited with code 3 before the test file ended.',
      ])
    })

    it.each<[string, UnitOutcome]>([
      ['a clean file', createRelated()],
      [
        'a failed try of the vm',
        createOutcome({}, [createTry({ realm: 'current', failed: true })]),
      ],
    ])('does not run a file again for %s', async (_name, outcome) => {
      let file = '/p/a.test.js'
      attempts.set(file, [outcome])
      await runDry(
        createHandle({ tests: [{ project: 'id-', path: file }] }),
        createRequest(),
      )

      expect(sent).toHaveLength(1)
      expect(log).not.toContain('drain')
    })

    describe('with fresh workers', () => {
      it.each<[string, UnitOutcome]>([
        ['a clean file', createRelated()],
        [
          'a failed try of the host realm',
          createOutcome({}, [createTry({ realm: 'host', failed: true })]),
        ],
        [
          'a failure of the host realm',
          createOutcome({ outcome: 'failure', realm: 'host' }),
        ],
        ['an execError', createOutcome({ execError: 'outside' })],
      ])(
        'does not run a file again for %s, as its first attempt was clean',
        async (_name, outcome) => {
          let file = '/p/a.test.js'
          attempts.set(file, [outcome])
          await runDry(
            createHandle({
              tests: [{ project: 'id-', path: file }],
              freshWorkers: true,
            }),
            createRequest(),
          )

          expect(sent.map(entry => entry.clean)).toStrictEqual([true])
        },
      )

      it('runs a file again for what a clean attempt may leave too, and tells of its end once', async () => {
        let file = '/p/a.test.js'
        let onUnitEnd = vi.fn<() => void>()
        let handle = createHandle({
          context: { ...createHandle().context, onUnitEnd },
          tests: [{ project: 'id-', path: file }],
          freshWorkers: true,
        })
        attempts.set(file, [createDeath(), createRelated()])
        await runDry(handle, createRequest())

        expect(log).toStrictEqual([file, 'drain', file])
        expect(sent.map(entry => entry.clean)).toStrictEqual([true, true])
        expect(onUnitEnd).toHaveBeenCalledExactlyOnceWith()
      })
    })
  })

  describe('running out of memory', () => {
    /**
     * The only test file of these tests.
     */
    let file = '/p/a.test.js'

    /**
     * Creates a handle that runs that file alone.
     *
     * @returns A session with a cap at its start.
     */
    function createHandleOfOne(): JestHandle {
      return createHandle({ tests: [{ project: 'id-', path: file }] })
    }

    it('takes one clean attempt, on a drained pool, and raises the cap for later workers', async () => {
      let handle = createHandleOfOne()
      attempts.set(file, [createOutOfMemory(512), createRelated()])
      let result = await runDry(handle, createRequest())

      expect(log).toStrictEqual([file, 'drain', file])
      expect(sent.map(entry => entry.clean)).toStrictEqual([false, true])
      expect(handle.heap.current).toBe(1024)
      expect(result.files).toMatchObject([{ loadFailed: false, errors: [] }])
    })

    it('reports a file whose clean attempt dies too, with no third attempt, and its end', async () => {
      let handle = createHandleOfOne()
      attempts.set(file, [
        createOutOfMemory(512),
        createDeath({ signal: 'SIGABRT', code: null }),
      ])
      let result = await runDry(handle, createRequest())

      expect(sent.map(entry => entry.clean)).toStrictEqual([false, true])
      expect(handle.heap.current).toBe(1024)
      expect(result.files).toMatchObject([
        {
          errors: [
            'The test process was stopped by SIGABRT before the test file ended.',
          ],
          loadFailed: true,
          file,
        },
      ])
    })

    it('still takes that one attempt at the top of the cap', async () => {
      let handle = createHandleOfOne()
      handle.heap.raise(4096)
      let top = handle.heap.current!
      attempts.set(file, [createOutOfMemory(top), createRelated()])
      await runDry(handle, createRequest())

      expect(sent.map(entry => entry.clean)).toStrictEqual([false, true])
      expect(handle.heap.current).toBe(top)
    })

    it('leaves the cap when no worker ran out of memory', async () => {
      let handle = createHandleOfOne()
      attempts.set(file, [createDeath(), createRelated()])
      await runDry(handle, createRequest())

      expect(handle.heap.current).toBe(512)
    })

    it('tells the context once for both attempts of a file', async () => {
      let onUnitEnd = vi.fn<() => void>()
      let handle = createHandleOfOne()
      handle.context.onUnitEnd = onUnitEnd
      attempts.set(file, [createOutOfMemory(512), createRelated()])
      await runDry(handle, createRequest())

      expect(onUnitEnd).toHaveBeenCalledExactlyOnceWith()
    })
  })

  describe('reporting', () => {
    it('reports files whose reads hold a related file, that hung or that had no done, and no others', async () => {
      let handle = createHandle({
        tests: [
          { path: '/p/related.test.js', project: 'id-' },
          { path: '/p/died.test.js', project: 'id-' },
          { path: '/p/unrelated.test.js', project: 'id-' },
          { path: '/p/hung.test.js', project: 'id-' },
          { path: '/p/failing.test.js', project: 'id-' },
        ],
      })
      attempts.set('/p/related.test.js', [createRelated()])
      attempts.set('/p/died.test.js', [createDeath()])
      attempts.set('/p/hung.test.js', [
        createDeath({
          records: [
            { occurrence: 0, kind: 'open', timeout: 5, name: 'b', time: 1 },
          ],
          signal: 'SIGKILL',
          hung: true,
          code: null,
        }),
      ])
      attempts.set('/p/failing.test.js', [
        createOutcome({}, [createTry({ realm: 'current', failed: true })]),
      ])
      let result = await runDry(handle, createRequest())

      expect(result.files.map(file => file.file)).toStrictEqual([
        '/p/died.test.js',
        '/p/hung.test.js',
        '/p/related.test.js',
      ])
      expect(result.tests).toStrictEqual([])
      expect(result.hung).toStrictEqual([
        {
          test: expect.any(String) as string,
          file: '/p/hung.test.js',
          name: 'b',
        },
      ])
    })

    it('reports every file when all that ran failed as a whole', async () => {
      attempts.set('/p/a.test.js', [
        createFailure('failure', 'the setup broke'),
      ])
      attempts.set('/p/b.test.js', [createFailure('empty', 'no tests here')])
      let result = await runDry(createHandle(), createRequest())

      expect(
        result.files.map(file => [file.file, file.loadFailed, file.errors]),
      ).toStrictEqual([
        ['/p/a.test.js', true, ['the setup broke']],
        ['/p/b.test.js', true, ['no tests here']],
      ])
    })

    it('does not report a file that failed as a whole when another one got to its tests', async () => {
      attempts.set('/p/a.test.js', [createFailure('failure', 'unrelated')])
      let result = await runDry(createHandle(), createRequest())

      expect(result.files).toStrictEqual([])
    })

    it('reports a file whose worker said it ended and left no finish, after a recheck, with its sentence', async () => {
      let handle = createHandle({
        tests: [{ path: '/p/a.test.js', project: 'id-' }],
      })
      attempts.set('/p/a.test.js', [
        createDeath({ records: [load], code: null }),
      ])
      let result = await runDry(handle, createRequest())

      expect(sent.map(entry => entry.clean)).toStrictEqual([false, true])
      expect(result.files).toMatchObject([
        {
          errors: ['The test process could not write what its test file did.'],
          file: '/p/a.test.js',
          loadFailed: true,
        },
      ])

      await runDry(handle, createRequest())

      expect(listSent()).toHaveLength(4)
    })

    it('sorts files by path and keeps the order of tests within a file', async () => {
      let handle = createHandle()
      attempts.set('/p/a.test.js', [
        createOutcome({ reads: ['/p/src/a.js'] }, [
          createTry({ name: 'z' }),
          createTry({ name: 'y' }),
        ]),
      ])
      attempts.set('/p/b.test.js', [
        createOutcome({ reads: ['/p/src/a.js'] }, [createTry({ name: 'x' })]),
      ])
      let result = await runDry(handle, createRequest())

      expect(result.files.map(file => file.file)).toStrictEqual([
        '/p/a.test.js',
        '/p/b.test.js',
      ])
      expect(result.tests.map(test => test.name)).toStrictEqual(['z', 'y', 'x'])
    })

    it('reads served and mismatched from every file, reported or not, sorted, and only from the last attempt', async () => {
      let handle = createHandle()
      attempts.set('/p/b.test.js', [
        createOutcome({}, [
          { file: '/p/src/z.js', kind: 'served', time: 1 },
          { file: '/p/src/n.js', kind: 'mismatched', time: 1 },
        ]),
      ])
      attempts.set('/p/a.test.js', [
        createDeath({
          records: [{ file: '/p/src/lost.js', kind: 'served', time: 1 }],
        }),
        createOutcome({}, [
          { file: '/p/src/a.js', kind: 'served', time: 1 },
          { file: '/p/src/m.js', kind: 'mismatched', time: 1 },
        ]),
      ])
      let result = await runDry(handle, createRequest())

      expect(result.files).toStrictEqual([])
      expect(result.served).toStrictEqual(['/p/src/a.js', '/p/src/z.js'])
      expect(result.mismatched).toStrictEqual(['/p/src/m.js', '/p/src/n.js'])
    })

    it('keeps the union of the sites outside since the session started, sorted', async () => {
      let handle = createHandle({
        tests: [{ path: '/p/a.test.js', project: 'id-' }],
      })
      attempts.set('/p/a.test.js', [
        createOutcome({ reads: ['/p/src/a.js'], outside: ['z', 'b'] }),
        createOutcome({ reads: ['/p/src/a.js'], outside: ['a'] }),
      ])
      let first = await runDry(handle, createRequest())
      let second = await runDry(handle, createRequest())

      expect(first.outside).toStrictEqual(['b', 'z'])
      expect(second.outside).toStrictEqual(['a', 'b', 'z'])
    })

    it('tells the context once per file, after a recheck too, and hands on the text of a failing file', async () => {
      let onUnitEnd = vi.fn<() => void>()
      let onOutput = vi.fn<(text: string, file: string | null) => void>()
      let handle = createHandle({
        context: { ...createHandle().context, onUnitEnd, onOutput },
      })
      attempts.set('/p/a.test.js', [
        createDeath(),
        createOutcome({ failureMessage: 'the diff' }),
      ])
      await runDry(handle, createRequest())

      expect(onUnitEnd).toHaveBeenCalledTimes(2)
      expect(onOutput.mock.calls).toStrictEqual([['the diff', '/p/a.test.js']])
    })

    it('hands on what a console kept, then the text of a failing file, and what it kept of a file that passed', async () => {
      let onOutput = vi.fn<(text: string, file: string | null) => void>()
      let handle = createHandle({
        context: { ...createHandle().context, onOutput },
      })
      attempts.set('/p/b.test.js', [
        createOutcome({ consoleOutput: 'passed and logged' }),
      ])
      attempts.set('/p/a.test.js', [
        createOutcome({
          consoleOutput: 'failed and logged',
          failureMessage: 'the diff',
        }),
      ])
      await runDry(handle, createRequest())

      expect(onOutput.mock.calls).toStrictEqual([
        ['passed and logged', '/p/b.test.js'],
        ['failed and logged', '/p/a.test.js'],
        ['the diff', '/p/a.test.js'],
      ])
    })

    it('hands on the text of the last attempt alone', async () => {
      let onOutput = vi.fn<(text: string, file: string | null) => void>()
      let handle = createHandle({
        context: { ...createHandle().context, onOutput },
      })
      attempts.set('/p/a.test.js', [
        createOutcome({ failureMessage: 'first', execError: 'outside' }),
        createOutcome({ failureMessage: 'last' }),
      ])
      await runDry(handle, createRequest())

      expect(onOutput.mock.calls).toStrictEqual([['last', '/p/a.test.js']])
    })

    it('runs without a context that listens', async () => {
      attempts.set('/p/a.test.js', [
        createOutcome({ failureMessage: 'the diff' }),
      ])

      await expect(
        runDry(createHandle(), createRequest()),
      ).resolves.toMatchObject({ hung: [] })
    })

    it('runs in the pool with its size, and keeps two units of one file apart', async () => {
      let handle = createHandle({
        tests: [
          { path: '/p/a.test.js', project: 'id-unit' },
          { path: '/p/a.test.js', project: 'id-lint' },
          { path: '/p/b.test.js', project: 'id-unit' },
          { path: '/p/c.test.js', project: 'id-unit' },
        ],
        projects: [createProject('unit'), createProject('lint')],
        pool: createPool(2),
      })
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
        return createOutcome()
      })
      await runDry(handle, createRequest())

      expect(most).toBe(2)
      expect(overlaps).toBe(0)
    })
  })

  describe('refusals', () => {
    it('throws once everything ran, one line per rejected file, sorted, relative to the root', async () => {
      let onUnitEnd = vi.fn<() => void>()
      let handle = createHandle({
        context: { ...createHandle().context, onUnitEnd },
      })
      attempts.set('/p/b.test.js', [
        createOutcome({}, [
          {
            file: '/p/src/z.ts',
            message: 'cannot z',
            kind: 'rejected',
            time: 1,
          },
          {
            file: '/p/src/x.ts',
            message: 'cannot x',
            kind: 'rejected',
            time: 2,
          },
          { file: '/p/src/x.ts', message: 'again', kind: 'rejected', time: 3 },
        ]),
      ])
      attempts.set('/p/a.test.js', [
        createOutcome({}, [
          {
            file: '/p/src/y.ts',
            message: 'cannot y',
            kind: 'rejected',
            time: 1,
          },
        ]),
      ])

      await expect(runDry(handle, createRequest())).rejects.toThrow(
        new Error(
          [
            "The test runner's transformer rejects the text with mutants of src/x.ts: cannot x; exclude the file.",
            "The test runner's transformer rejects the text with mutants of src/y.ts: cannot y; exclude the file.",
            "The test runner's transformer rejects the text with mutants of src/z.ts: cannot z; exclude the file.",
          ].join('\n'),
        ),
      )
      expect(onUnitEnd).toHaveBeenCalledTimes(2)
    })

    it('throws once everything ran for a clean result with no load record, naming the first file', async () => {
      let onUnitEnd = vi.fn<() => void>()
      let handle = createHandle({
        context: { ...createHandle().context, onUnitEnd },
      })
      for (let file of ['/p/a.test.js', '/p/b.test.js']) {
        attempts.set(file, [
          {
            records: [createFinish()],
            outOfMemory: null,
            signal: null,
            hung: false,
            done: true,
            startup: 0,
            code: null,
          },
        ])
      }

      await expect(runDry(handle, createRequest())).rejects.toThrow(
        'Jest ran a.test.js with no test framework mootant can follow; jest-circus is required.',
      )
      expect(onUnitEnd).toHaveBeenCalledTimes(2)
    })

    it('tells a rejected text before a framework it cannot follow', async () => {
      attempts.set('/p/a.test.js', [
        {
          records: [
            { file: '/p/src/x.ts', kind: 'rejected', message: 'no', time: 1 },
            createFinish(),
          ],
          outOfMemory: null,
          signal: null,
          hung: false,
          done: true,
          startup: 0,
          code: null,
        },
      ])

      await expect(runDry(createHandle(), createRequest())).rejects.toThrow(
        'rejects the text with mutants of src/x.ts',
      )
    })

    it.each<[string, UnitOutcome]>([
      [
        'an execError',
        {
          records: [createFinish({ execError: 'outside' })],
          outOfMemory: null,
          signal: null,
          hung: false,
          done: true,
          startup: 0,
          code: null,
        },
      ],
      [
        'a failure',
        {
          records: [createFinish({ outcome: 'failure', message: 'm' })],
          outOfMemory: null,
          signal: null,
          hung: false,
          done: true,
          startup: 0,
          code: null,
        },
      ],
      [
        'an empty file',
        {
          records: [createFinish({ outcome: 'empty', message: 'm' })],
          outOfMemory: null,
          signal: null,
          hung: false,
          done: true,
          startup: 0,
          code: null,
        },
      ],
    ])(
      'takes %s with no load record for no missing framework',
      async (_name, outcome) => {
        attempts.set('/p/a.test.js', [outcome])

        await expect(
          runDry(createHandle(), createRequest()),
        ).resolves.toMatchObject({ hung: [] })
      },
    )
  })
})
