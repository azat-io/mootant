import { describe, expect, it } from 'vitest'

import type { FakeAdapter, FakeWorld } from '../../helpers/create-fake-adapter'
import type { SwitchedFile } from '../../../types/adapter/switched-file'

import { createFakeAdapter } from '../../helpers/create-fake-adapter'
import { runDryPhase } from '../../../core/run/run-dry-phase'

/**
 * Watchdog budgets the dry phase asks for.
 */
const TIMEOUTS = { file: 60_000, test: 60_000 }

/**
 * Mutants of the source files of the tests.
 */
const SOURCES: Record<string, string[]> = {
  '/src/a.ts': ['a1', 'a2'],
  '/src/b.ts': ['b1'],
}

/**
 * Runs the dry phase over a simulated project with `/src/a.ts` and `/src/b.ts`
 * switched.
 *
 * @param world - Simulated project.
 * @param repeat - Whether every test is tried twice, as in fast mode.
 * @param progress - Receives the reasons of dry runs that run again, and the
 *   other events as JSON.
 * @returns Outcome of the phase, the switched files left and the adapter.
 */
async function run(
  world: FakeWorld,
  repeat = true,
  progress: string[] = [],
): Promise<{
  phase: Awaited<ReturnType<typeof runDryPhase>>
  switched: SwitchedFile[]
  progress: string[]
  fake: FakeAdapter
}> {
  let fake = createFakeAdapter(world)
  let switched: SwitchedFile[] = Object.entries(SOURCES).map(([file, ids]) => ({
    switched: ids.map(id => `hit("${id}")`).join(';'),
    original: '',
    file,
  }))
  let session = await fake.adapter.start({
    workDirectory: '/work',
    concurrency: null,
    files: switched,
    root: '/',
  })
  let phase = await runDryPhase(session, {
    mutantFiles: new Map(
      Object.entries(SOURCES).flatMap(([file, ids]) =>
        ids.map(id => [id, file] as const),
      ),
    ),
    report: event => {
      progress.push(
        event.kind === 'dry-again' ? event.message : JSON.stringify(event),
      )
    },
    displays: new Map([
      ['/src/a.ts', 'src/a.ts'],
      ['/src/b.ts', 'src/b.ts'],
    ]),
    root: '/',
    switched,
    repeat,
  })
  return { progress, switched, phase, fake }
}

/**
 * Lists the messages of the diagnostics of a dry phase.
 *
 * @param phase - Outcome of the phase.
 * @param phase.diagnostics - Its diagnostics.
 * @returns Messages in order.
 */
function listMessages(phase: { diagnostics: { message: string }[] }): string[] {
  return phase.diagnostics.map(diagnostic => diagnostic.message)
}

/**
 * Builds the `unserved` list of a dry run for `/src/b.ts`.
 *
 * @param text - Reason of the file.
 * @returns List with the file.
 */
function reason(text: string): { reason: string; file: string }[] {
  return [{ file: '/src/b.ts', reason: text }]
}

describe('runDryPhase', () => {
  it('does not run without switched files', async () => {
    let fake = createFakeAdapter({ tests: [] })
    let session = await fake.adapter.start({
      workDirectory: '/work',
      concurrency: null,
      files: [],
      root: '/',
    })

    await expect(
      runDryPhase(session, {
        mutantFiles: new Map(),
        displays: new Map(),
        report: () => {},
        repeat: false,
        switched: [],
        root: '/',
      }),
    ).resolves.toStrictEqual({
      dry: {
        mismatched: [],
        outside: [],
        served: [],
        files: [],
        tests: [],
        hung: [],
      },
      unrepeatableFiles: new Set(),
      errors: new Map(),
      diagnostics: [],
      runs: 0,
    })
    expect(fake.calls.dry).toStrictEqual([])
  })

  it('gives an empty dry run when no test is related', async () => {
    let { progress, phase } = await run({
      unserved: ['/src/a.ts', '/src/b.ts'],
      tests: [],
    })

    expect(progress).toStrictEqual(['{"files":2,"kind":"dry-start"}'])
    expect(phase.runs).toBe(1)
    expect(phase.dry.tests).toStrictEqual([])
    expect(
      phase.diagnostics.map(diagnostic => diagnostic.message),
    ).toStrictEqual([
      "No test loaded src/a.ts through the test runner's transform: no test imports it, or tests import a built copy, an external or a pre-bundled dependency.",
      "No test loaded src/b.ts through the test runner's transform: no test imports it, or tests import a built copy, an external or a pre-bundled dependency.",
    ])
  })

  it('reports mismatched and never served files', async () => {
    let { phase, fake } = await run({
      tests: [{ covers: ['a1', 'b1'], file: '/t/a.test.ts', id: 't1' }],
      mismatched: ['/src/a.ts'],
      unserved: ['/src/b.ts'],
    })

    expect(fake.calls.dry).toStrictEqual([
      {
        related: ['/src/a.ts', '/src/b.ts'],
        timeouts: TIMEOUTS,
        instrumented: true,
        repeat: true,
        files: null,
      },
    ])
    expect(phase.runs).toBe(1)
    expect(phase.dry.tests.map(test => test.id)).toStrictEqual(['t1'])
    expect(phase.errors).toStrictEqual(
      new Map([
        [
          'src/a.ts',
          'The test runner loaded src/a.ts with a text that differs from the listed one; its mutants are not run.',
        ],
      ]),
    )
    expect(phase.diagnostics).toStrictEqual([
      {
        message:
          'The test runner loaded src/a.ts with a text that differs from the listed one; its mutants are not run.',
        code: 'instrument-error',
        severity: 'error',
        file: 'src/a.ts',
        column: null,
        line: null,
      },
      {
        message:
          "No test loaded src/b.ts through the test runner's transform: no test imports it, or tests import a built copy, an external or a pre-bundled dependency.",
        code: 'never-served',
        severity: 'warning',
        file: 'src/b.ts',
        column: null,
        line: null,
      },
    ])
  })

  it('stops on tests that fail without the switched files', async () => {
    let tests: FakeWorld['tests'] = Array.from({ length: 11 }, (_, index) => ({
      file: '/t/a.test.ts',
      id: `t${index}`,
      dry: 'failing',
    }))
    let world: FakeWorld = {
      onDry: (result, request) => ({
        ...result,
        tests: result.tests.map((test, index) =>
          index === 0 ?
            {
              ...test,
              tries: test.tries.map(facts => ({
                ...facts,
                message: 'Snapshot `t0 1` mismatched',
              })),
            }
          : test,
        ),
        files:
          request.instrumented ?
            result.files
          : [{ ...result.files[0]!, loadFailed: true, errors: [] }],
      }),
      tests: [...tests, { file: '/t/a.test.ts', covers: ['a1'], id: 'ok' }],
      files: [{ file: '/t/a.test.ts', loadCovers: ['a1'], broken: true }],
    }
    let progress: string[] = []

    await expect(run(world, true, progress)).rejects.toThrow(
      [
        'Tests fail without mutants; fix them first (11 tests, 1 test file):',
        '  t/a.test.ts: fails to load: unknown error',
        '  t/a.test.ts > t0: Snapshot `t0 1` mismatched',
        '  t/a.test.ts > t1: expected true to be false',
        '  t/a.test.ts > t2: expected true to be false',
        '  t/a.test.ts > t3: expected true to be false',
        '  t/a.test.ts > t4: expected true to be false',
        '  t/a.test.ts > t5: expected true to be false',
        '  t/a.test.ts > t6: expected true to be false',
        '  t/a.test.ts > t7: expected true to be false',
        '  t/a.test.ts > t8: expected true to be false',
        '  and 2 more',
        'Snapshots may be missing: mootant never writes them, so write them with the test runner first.',
      ].join('\n'),
    )
    expect(progress.at(-1)).toBe(
      JSON.stringify({ files: ['t/a.test.ts'], kind: 'dry-failed' }),
    )
  })

  it('reruns the files of failing tests once without the switched files', async () => {
    let fake = createFakeAdapter({
      onDry: result => ({
        ...result,
        tests: result.tests.map(test => ({
          ...test,
          tries: test.tries.map(facts => ({ ...facts, message: null })),
        })),
      }),
      tests: [
        { file: '/t/a.test.ts', dry: 'failing', id: 't1' },
        { file: '/t/a.test.ts', covers: ['a1'], id: 't2' },
      ],
    })
    let switched = [{ switched: 'hit("a1")', file: '/src/a.ts', original: '' }]
    let session = await fake.adapter.start({
      workDirectory: '/work',
      concurrency: null,
      files: switched,
      root: '/',
    })

    await expect(
      runDryPhase(session, {
        displays: new Map([['/src/a.ts', 'src/a.ts']]),
        mutantFiles: new Map([['a1', '/src/a.ts']]),
        report: () => {},
        repeat: true,
        root: '/',
        switched,
      }),
    ).rejects.toThrow(
      'Tests fail without mutants; fix them first (1 test):\n  t/a.test.ts > t1: failed',
    )
    expect(fake.calls.dry.slice(1)).toStrictEqual([
      {
        files: [{ file: '/t/a.test.ts', project: '' }],
        related: ['/src/a.ts'],
        instrumented: true,
        timeouts: TIMEOUTS,
        repeat: false,
      },
      {
        files: [{ file: '/t/a.test.ts', project: '' }],
        related: ['/src/a.ts'],
        instrumented: false,
        timeouts: TIMEOUTS,
        repeat: false,
      },
    ])
  })

  it('drops the switched files that break tests and runs again', async () => {
    let { progress, switched, phase, fake } = await run({
      tests: [
        { file: '/t/a.test.ts', covers: ['a1'], dry: 'broken', id: 't1' },
        { file: '/t/a.test.ts', covers: ['b1'], id: 't2' },
        { file: '/t/b.test.ts', id: 'b1' },
      ],
      files: [{ file: '/t/b.test.ts', loadCovers: ['a2'], broken: true }],
    })

    expect(phase.runs).toBe(4)
    expect(progress).toStrictEqual([
      '{"files":2,"kind":"dry-start"}',
      '2 test files failed with each test run twice; running them again with each test once.',
      'Some tests failed; running them again without mutants to check.',
      'Running the dry run again without 1 file that broke tests.',
    ])
    let files = [
      { file: '/t/a.test.ts', project: '' },
      { file: '/t/b.test.ts', project: '' },
    ]
    expect(fake.calls.dry.slice(1)).toStrictEqual([
      {
        related: ['/src/a.ts', '/src/b.ts'],
        instrumented: true,
        timeouts: TIMEOUTS,
        repeat: false,
        files,
      },
      {
        related: ['/src/a.ts', '/src/b.ts'],
        instrumented: false,
        timeouts: TIMEOUTS,
        repeat: false,
        files,
      },
      {
        related: ['/src/b.ts'],
        timeouts: TIMEOUTS,
        instrumented: true,
        repeat: true,
        files: null,
      },
    ])
    expect(switched.map(entry => entry.file)).toStrictEqual(['/src/b.ts'])
    expect(phase.errors).toStrictEqual(
      new Map([
        [
          'src/a.ts',
          'Tests fail with the switched src/a.ts and pass without it; its mutants are not run.',
        ],
      ]),
    )
    expect(phase.diagnostics).toStrictEqual([
      {
        message:
          'Tests fail with the switched src/a.ts and pass without it; its mutants are not run.',
        code: 'instrumentation-break',
        severity: 'error',
        file: 'src/a.ts',
        column: null,
        line: null,
      },
    ])
    expect(phase.dry.tests.map(test => test.tries[0]!.covers)).toStrictEqual([
      [],
      ['b1'],
      [],
    ])
  })

  it('tries each test once outside fast mode and checks failures at once', async () => {
    let { progress, switched, phase, fake } = await run(
      {
        tests: [
          { file: '/t/a.test.ts', covers: ['a1'], dry: 'broken', id: 't1' },
          { file: '/t/b.test.ts', dry: 'repeated', covers: ['b1'], id: 't2' },
        ],
      },
      false,
    )

    expect(progress).toStrictEqual([
      '{"files":2,"kind":"dry-start"}',
      'Some tests failed; running them again without mutants to check.',
      'Running the dry run again without 1 file that broke tests.',
    ])
    expect(fake.calls.dry.map(request => request.repeat)).toStrictEqual([
      false,
      false,
      false,
    ])
    expect(phase.runs).toBe(3)
    expect(phase.unrepeatableFiles).toStrictEqual(new Set())
    expect(switched.map(entry => entry.file)).toStrictEqual(['/src/b.ts'])
    expect(
      phase.dry.tests.map(test => [test.id, test.tries.length]),
    ).toStrictEqual([
      ['t1', 1],
      ['t2', 1],
    ])
  })

  it('keeps the results of a run with each test once for files that fail only when repeated', async () => {
    let { progress, phase, fake } = await run({
      tests: [
        { file: '/t/a.test.ts', covers: ['a1'], id: 't1' },
        { file: '/t/a.test.ts', dry: 'repeated', covers: ['a2'], id: 't2' },
        { file: '/t/b.test.ts', covers: ['b1'], id: 't3' },
      ],
      onDry: (result, request) => ({
        ...result,
        served: request.repeat ? ['/src/b.ts'] : ['/src/a.ts', '/src/b.ts'],
        mismatched: request.repeat ? [] : ['/src/c.ts'],
      }),
    })

    expect(progress).toStrictEqual([
      '{"files":2,"kind":"dry-start"}',
      '1 test file failed with each test run twice; running them again with each test once.',
    ])
    expect(fake.calls.dry[1]).toStrictEqual({
      files: [{ file: '/t/a.test.ts', project: '' }],
      related: ['/src/a.ts', '/src/b.ts'],
      instrumented: true,
      timeouts: TIMEOUTS,
      repeat: false,
    })
    expect(phase.runs).toBe(2)
    expect(phase.unrepeatableFiles).toStrictEqual(new Set(['/t/a.test.ts']))
    expect(phase.diagnostics).toStrictEqual([])
    expect(phase.dry.mismatched).toStrictEqual(['/src/c.ts'])
    expect(phase.dry.served).toStrictEqual(['/src/a.ts', '/src/b.ts'])
    expect(
      phase.dry.tests.map(test => [test.id, test.tries.length]),
    ).toStrictEqual([
      ['t1', 1],
      ['t2', 1],
      ['t3', 2],
    ])
    expect(phase.dry.files.map(file => file.file)).toStrictEqual([
      '/t/a.test.ts',
      '/t/b.test.ts',
    ])
  })

  it('reruns files once more after dropping the files that broke tests', async () => {
    let { phase } = await run({
      tests: [
        { file: '/t/a.test.ts', covers: ['a1'], dry: 'broken', id: 't1' },
        { file: '/t/b.test.ts', dry: 'repeated', covers: ['b1'], id: 't2' },
      ],
    })

    expect(phase.runs).toBe(5)
    expect(phase.unrepeatableFiles).toStrictEqual(new Set(['/t/b.test.ts']))
    expect(
      phase.dry.tests.map(test => [test.id, test.tries.length]),
    ).toStrictEqual([
      ['t1', 2],
      ['t2', 1],
    ])
  })

  it('drops every switched file when the breakage reached no site', async () => {
    let { switched, phase } = await run({
      onDry: (result, request) => ({
        ...result,
        tests: result.tests.map(test => ({
          ...test,
          tries: test.tries.map(facts => ({
            ...facts,
            failed: request.instrumented,
            covers: null,
          })),
        })),
      }),
      tests: [{ file: '/t/a.test.ts', id: 't1' }],
    })

    expect(phase.runs).toBe(3)
    expect(switched).toStrictEqual([])
    expect([...phase.errors.keys()]).toStrictEqual(['src/a.ts', 'src/b.ts'])
    expect(phase.dry).toStrictEqual({
      mismatched: [],
      outside: [],
      served: [],
      files: [],
      tests: [],
      hung: [],
    })
  })

  it('stops when tests still fail after the broken files were dropped', async () => {
    await expect(
      run({
        onDry: (result, request) => ({
          ...result,
          files: result.files.map(file => ({
            ...file,
            loadFailed: request.instrumented,
            errors: ['boom'],
          })),
          tests: [],
        }),
        tests: [
          { file: '/t/a.test.ts', covers: ['b1'], id: 't1' },
          { file: '/t/b.test.ts', id: 't2' },
        ],
        files: [{ file: '/t/a.test.ts', loadCovers: ['a1'] }],
      }),
    ).rejects.toThrow(
      "Tests still fail with mootant's switched files after the files that broke them were dropped (2 test files):\n  t/a.test.ts: fails to load: boom\n  t/b.test.ts: fails to load: boom",
    )
  })

  it('merges served and mismatched files of both instrumented runs', async () => {
    let { phase } = await run({
      tests: [
        { file: '/t/a.test.ts', covers: ['a1'], dry: 'broken', id: 't1' },
        { file: '/t/b.test.ts', covers: ['b1'], id: 't2' },
      ],
      onDry: (result, request) =>
        request.related.length === 1 ?
          result
        : { ...result, mismatched: [], served: [] },
      mismatched: ['/src/b.ts'],
    })

    expect(phase.diagnostics.map(diagnostic => diagnostic.code)).toStrictEqual([
      'instrumentation-break',
      'instrument-error',
    ])
  })

  it('names how a never served file was loaded past the adapter', async () => {
    let repeated = [
      {
        dry: 'repeated' as const,
        file: '/t/a.test.ts',
        covers: ['a1'],
        id: 't1',
      },
    ]

    let first = await run({
      onDry: (result, request) => ({
        ...result,
        ...(request.repeat && { unserved: reason('first') }),
        served: ['/src/a.ts'],
      }),
      tests: repeated,
    })
    let once = await run({
      onDry: (result, request) => ({
        ...result,
        ...(!request.repeat && { unserved: reason('once') }),
        served: ['/src/a.ts'],
      }),
      tests: repeated,
    })
    let again = await run({
      onDry: (result, request) =>
        request.related.length === 1 ?
          { ...result, unserved: reason('again'), served: [] }
        : { ...result, served: [] },
      tests: [
        { file: '/t/a.test.ts', covers: ['a1'], dry: 'broken', id: 't1' },
        { file: '/t/b.test.ts', covers: ['b1'], id: 't2' },
      ],
    })

    expect(listMessages(first.phase)).toStrictEqual([
      "No test loaded src/b.ts through the test runner's transform: first.",
    ])
    expect(listMessages(once.phase)).toStrictEqual([
      "No test loaded src/b.ts through the test runner's transform: once.",
    ])
    expect(listMessages(again.phase).at(-1)).toBe(
      "No test loaded src/b.ts through the test runner's transform: again.",
    )
  })

  it('merges the mutants both runs saw outside the workers', async () => {
    let { phase } = await run({
      onDry: (result, request) => ({
        ...result,
        outside: request.repeat ? ['b1', 'a1'] : ['a1', 'c1'],
      }),
      tests: [
        { file: '/t/a.test.ts', dry: 'repeated', covers: ['a1'], id: 't1' },
      ],
    })

    expect(phase.runs).toBe(2)
    expect(phase.dry.outside).toStrictEqual(['a1', 'b1', 'c1'])
  })

  it('reports the test files of tests that still fail after dropping files', async () => {
    let progress: string[] = []

    await expect(
      run(
        {
          onDry: (result, request) => ({
            ...result,
            files: result.files.map(file => ({
              ...file,
              loadFailed: request.instrumented,
              errors: ['boom'],
            })),
            tests: [],
          }),
          tests: [
            { file: '/t/b.test.ts', covers: ['b1'], id: 't1' },
            { file: '/t/a.test.ts', id: 't2' },
          ],
          files: [{ file: '/t/a.test.ts', loadCovers: ['a1'] }],
        },
        true,
        progress,
      ),
    ).rejects.toThrow('Tests still fail')
    expect(progress.at(-1)).toBe(
      JSON.stringify({
        files: ['t/a.test.ts', 't/b.test.ts'],
        kind: 'dry-failed',
      }),
    )
  })

  it('stops when a test hangs without mutants', async () => {
    await expect(
      run({
        onDry: result => ({
          ...result,
          hung: [{ name: 'suite > loops', file: '/t/a.test.ts', test: 't1' }],
        }),
        tests: [{ file: '/t/a.test.ts', covers: ['a1'], id: 't1' }],
      }),
    ).rejects.toThrow(
      'Tests hang without mutants: "suite > loops" in t/a.test.ts did not finish within 60 s plus its own timeout and the timeouts of its hooks, and its worker was stopped.',
    )
  })

  it('stops when a test file hangs outside tests without mutants', async () => {
    await expect(
      run({
        onDry: (result, request) =>
          request.instrumented ? result : (
            {
              ...result,
              hung: [{ file: '/t/b.test.ts', name: null, test: null }],
            }
          ),
        tests: [
          { file: '/t/a.test.ts', covers: ['a1'], dry: 'broken', id: 't1' },
        ],
      }),
    ).rejects.toThrow(
      'Tests hang without mutants: t/b.test.ts did not finish loading or its suite hooks within 60 s plus the timeouts of its suite hooks, and its worker was stopped.',
    )
  })
})
