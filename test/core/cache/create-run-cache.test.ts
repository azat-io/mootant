import { describe, expect, it } from 'vitest'

import type { MutantVerdict } from '../../../types/run/mutant-state'
import type { RunInputs } from '../../../types/adapter/run-inputs'
import type { CacheEntry } from '../../../types/cache/cache-entry'
import type { RunState } from '../../../types/run/run-state'

import { createRunCache } from '../../../core/cache/create-run-cache'
import { createTestRun } from '../../helpers/create-test-run'

/**
 * Kill of `m1` by test `a1`.
 */
let kill: MutantVerdict = {
  file: '/t/a.test.ts',
  cause: 'assertion',
  status: 'Killed',
  message: 'boom',
  test: 'a1',
}

/**
 * What a run read when it read nothing beyond its test file.
 */
let read: RunInputs = { dependencies: ['/t/a.test.ts'], environment: [] }

/**
 * Creates a cache over stored entries.
 *
 * @param state - State of the run.
 * @param fields - Inputs that differ from the defaults.
 * @returns The cache.
 */
function create(
  state: RunState,
  fields: Partial<Parameters<typeof createRunCache>[0]> = {},
): ReturnType<typeof createRunCache> {
  return createRunCache({
    dependencies: new Map([['/t/a.test.ts', ['/t/a.test.ts']]]),
    fileKeys: new Map([['/t/a.test.ts', 'f1']]),
    sources: new Map([['src/a.ts', 's1']]),
    stored: storedOf(new Map()),
    analysis: state.analysis,
    hashes: new Map(),
    reads: new Map(),
    environment: [],
    variables: {},
    root: '/',
    now: 10,
    ...fields,
  })
}

/**
 * Creates the state of a run where test `a1` of `/t/a.test.ts` covers `m1` and
 * `m2`.
 *
 * @returns State of the run.
 */
async function createState(): Promise<RunState> {
  let { state } = await createTestRun(
    { tests: [{ file: '/t/a.test.ts', covers: ['m1', 'm2'], id: 'a1' }] },
    { mutants: ['m1', 'm2'], isolate: true },
  )
  return state
}

/**
 * Wraps entries as the content of a cache file without inputs.
 *
 * @param entries - Entries by slot.
 * @returns Stored entries.
 */
function storedOf(
  entries: Map<string, CacheEntry>,
): Parameters<typeof createRunCache>[0]['stored'] {
  return { inputs: new Map(), entries }
}

describe('createRunCache', () => {
  it('reuses kills and reached passes of an unchanged mutant and test file', async () => {
    let state = await createState()
    let first = create(state)
    first.recordUnit(state.mutants.get('m1')!, '/t/a.test.ts', {
      verdict: kill,
      inputs: read,
    })
    first.recordUnit(state.mutants.get('m2')!, '/t/a.test.ts', {
      verdict: 'survived',
      inputs: read,
    })
    let second = create(state, { stored: storedOf(first.entries), now: 20 })

    expect([...first.entries.values()].map(entry => entry.used)).toStrictEqual([
      10, 10,
    ])
    expect(
      second.lookupUnit(state.mutants.get('m1')!, '/t/a.test.ts'),
    ).toStrictEqual(kill)
    expect(second.lookupUnit(state.mutants.get('m2')!, '/t/a.test.ts')).toBe(
      'survived',
    )
    expect([...second.entries.values()].map(entry => entry.used)).toStrictEqual(
      [20, 20],
    )
  })

  it.each<[string, Partial<Parameters<typeof createRunCache>[0]>]>([
    ['the source changed', { sources: new Map([['src/a.ts', 's2']]) }],
    ['the test file changed', { fileKeys: new Map([['/t/a.test.ts', 'f2']]) }],
    ['the test file has no key', { fileKeys: new Map() }],
    ['the source file has no text', { sources: new Map() }],
  ])('reuses nothing when %s', async (_name, fields) => {
    let state = await createState()
    let first = create(state)
    first.recordUnit(state.mutants.get('m1')!, '/t/a.test.ts', {
      verdict: kill,
      inputs: read,
    })
    let second = create(state, { stored: storedOf(first.entries), ...fields })

    expect(
      second.lookupUnit(state.mutants.get('m1')!, '/t/a.test.ts'),
    ).toBeNull()
    expect(second.entries.size).toBe(0)
  })

  it('reuses nothing when the mutant became static', async () => {
    let state = await createState()
    let first = create(state)
    first.recordUnit(state.mutants.get('m1')!, '/t/a.test.ts', {
      verdict: kill,
      inputs: read,
    })
    state.mutants.get('m1')!.static = true

    expect(
      create(state, { stored: storedOf(first.entries) }).lookupUnit(
        state.mutants.get('m1')!,
        '/t/a.test.ts',
      ),
    ).toBeNull()
  })

  it('reuses no kill by a test the dry run did not see', async () => {
    let state = await createState()
    let first = create(state)
    first.recordUnit(state.mutants.get('m1')!, '/t/a.test.ts', {
      verdict: { ...kill, test: 'gone' },
      inputs: read,
    })

    expect(
      create(state, { stored: storedOf(first.entries) }).lookupUnit(
        state.mutants.get('m1')!,
        '/t/a.test.ts',
      ),
    ).toBeNull()
  })

  it('stores no timeouts, errors, crashes, test files without a key or runs with unknown inputs', async () => {
    let state = await createState()
    let cache = create(state)
    let mutant = state.mutants.get('m1')!
    cache.recordUnit(mutant, '/t/a.test.ts', {
      verdict: { ...kill, cause: 'hit-limit', status: 'Timeout' },
      inputs: read,
    })
    cache.recordUnit(mutant, '/t/a.test.ts', {
      verdict: { ...kill, status: 'Error', cause: null },
      inputs: read,
    })
    cache.recordUnit(mutant, '/t/a.test.ts', {
      verdict: { ...kill, cause: 'crash' },
      inputs: read,
    })
    cache.recordUnit(mutant, '/t/b.test.ts', { verdict: kill, inputs: read })
    cache.recordUnit(mutant, '/t/a.test.ts', { verdict: kill, inputs: null })
    cache.recordBatch(mutant, 'a1', { inputs: undefined, verdict: kill })

    expect(cache.entries.size).toBe(0)
    expect(cache.pending.size).toBe(0)
  })

  it('keeps what a run read beyond the dry run of its test file', async () => {
    let state = await createState()
    let cache = create(state, {
      reads: new Map([['/t/a.test.ts', ['HOME']]]),
      variables: { '': { MODE: 'h1' } },
    })
    let [m1, m2] = [state.mutants.get('m1')!, state.mutants.get('m2')!]
    cache.recordUnit(m1, '/t/a.test.ts', {
      inputs: {
        dependencies: ['/t/a.test.ts', '/lib/lazy.js', '/t/data.json'],
        environment: ['MODE', 'HOME', 'UNSET', 'MODE'],
      },
      verdict: kill,
    })
    cache.recordUnit(m2, '/t/a.test.ts', {
      inputs: {
        environment: ['HOME'],
        dependencies: [],
      },
      verdict: 'survived',
    })

    expect([...cache.pending.values()]).toStrictEqual([
      {
        environment: [
          ['MODE', 'h1'],
          ['UNSET', null],
        ],
        files: ['/lib/lazy.js', '/t/data.json'],
      },
    ])
    expect(
      [...cache.entries.values()].map(entry => entry.inputs),
    ).toStrictEqual([null, null])

    cache.recordUnit(m1, '/t/a.test.ts', { verdict: kill, inputs: read })

    expect(cache.pending.size).toBe(0)
  })

  it('reuses evidence with extra inputs only while they are unchanged', async () => {
    let state = await createState()
    let first = create(state)
    let mutant = state.mutants.get('m1')!
    first.recordUnit(mutant, '/t/a.test.ts', { verdict: kill, inputs: read })
    let entries = new Map(
      [...first.entries].map(([slot, entry]): [string, CacheEntry] => [
        slot,
        { ...entry, inputs: 'i1' },
      ]),
    )
    let stored = {
      inputs: new Map([
        [
          'i1',
          {
            files: [
              ['lib/lazy.js', 'l1'],
              ['t/gone.json', null],
            ] as [string, string | null][],
            environment: [
              ['MODE', 'h1'],
              ['UNSET', null],
            ] as [string, string | null][],
          },
        ],
      ]),
      entries,
    }
    let hashes = new Map([['/lib/lazy.js', 'l1']])
    let variables = { '': { MODE: 'h1' } }
    let valid = create(state, { variables, hashes, stored })

    expect(valid.lookupUnit(mutant, '/t/a.test.ts')).toStrictEqual(kill)
    expect([...valid.inputs.keys()]).toStrictEqual(['i1'])
    expect([...valid.entries.values()]).toMatchObject([{ inputs: 'i1' }])
    expect(
      create(state, {
        hashes: new Map([['/lib/lazy.js', 'l2']]),
        variables,
        stored,
      }).lookupUnit(mutant, '/t/a.test.ts'),
    ).toBeNull()
    expect(
      create(state, {
        variables: { '': { MODE: 'h2' } },
        hashes,
        stored,
      }).lookupUnit(mutant, '/t/a.test.ts'),
    ).toBeNull()
    expect(
      create(state, { variables: {}, hashes, stored }).lookupUnit(
        mutant,
        '/t/a.test.ts',
      ),
    ).toBeNull()
  })

  it('keeps batch kills apart from isolated evidence', async () => {
    let state = await createState()
    let first = create(state)
    let mutant = state.mutants.get('m1')!
    first.recordBatch(mutant, 'a1', { verdict: kill, inputs: read })
    let second = create(state, { stored: storedOf(first.entries) })

    expect([...first.entries.values()]).toMatchObject([
      { status: 'Killed', path: 'batch', test: 'a1' },
    ])
    expect(second.lookupBatch(mutant, 'a1')).toStrictEqual(kill)
    expect(second.lookupUnit(mutant, '/t/a.test.ts')).toBeNull()
  })

  it('reuses no batch entry that is not a kill', async () => {
    let state = await createState()
    let first = create(state)
    let mutant = state.mutants.get('m1')!
    first.recordBatch(mutant, 'a1', { verdict: kill, inputs: read })
    let stored = new Map(
      [...first.entries].map(([slot, entry]): [string, CacheEntry] => [
        slot,
        { ...entry, status: 'Survived', test: null },
      ]),
    )

    expect(
      create(state, { stored: storedOf(stored) }).lookupBatch(mutant, 'a1'),
    ).toBeNull()
  })

  it('forgets what was written or reused for one test file', async () => {
    let { state } = await createTestRun(
      {
        tests: [
          { file: '/t/a.test.ts', covers: ['m1'], id: 'a1' },
          { file: '/t/b.test.ts', covers: ['m1'], id: 'b1' },
        ],
      },
      { mutants: ['m1'], isolate: true },
    )
    let fileKeys = new Map([
      ['/t/a.test.ts', 'f1'],
      ['/t/b.test.ts', 'f2'],
    ])
    let mutant = state.mutants.get('m1')!
    let first = create(state, {
      dependencies: new Map([['/t/a.test.ts', ['/t/a.test.ts']]]),
      environment: ['/vitest.config.ts'],
      fileKeys,
    })
    first.recordUnit(mutant, '/t/a.test.ts', {
      verdict: 'survived',
      inputs: read,
    })
    first.recordUnit(mutant, '/t/b.test.ts', { verdict: kill, inputs: read })
    let second = create(state, { stored: storedOf(first.entries), fileKeys })
    second.lookupUnit(mutant, '/t/a.test.ts')
    second.lookupUnit(mutant, '/t/b.test.ts')
    first.forget('/t/a.test.ts')
    second.forget('/t/b.test.ts')

    expect(first.dependencies).toStrictEqual(
      new Map([['/t/a.test.ts', ['/t/a.test.ts']]]),
    )
    expect(first.environment).toStrictEqual(['/vitest.config.ts'])
    expect([...first.entries.values()]).toMatchObject([{ status: 'Killed' }])
    expect([...second.entries.values()]).toMatchObject([{ status: 'Survived' }])
  })
})
