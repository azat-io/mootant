import { describe, expect, it } from 'vitest'

import type { IsolatedFacts } from '../../../types/adapter/isolated-result'
import type { RunEvent } from '../../../types/run/run-event'

import { createHitLimitError } from '../../../core/runtime/create-hit-limit-error'
import { previewIsolatedUnit } from '../../../core/run/preview-isolated-unit'
import { runIsolatedRounds } from '../../../core/run/run-isolated-rounds'
import { getFinalStatus } from '../../../core/run/get-final-status'
import { createTestRun } from '../../helpers/create-test-run'

describe('runIsolatedRounds', () => {
  it('runs the files of a mutant in order and takes the first kill', async () => {
    let { session, state, fake } = await createTestRun(
      {
        tests: [
          { covers: ['early', 'late'], file: '/t/a.test.ts', id: 'a1' },
          {
            covers: ['early', 'late'],
            kills: { late: 'boom' },
            file: '/t/b.test.ts',
            duration: 5,
            id: 'b1',
          },
          { file: '/t/c.test.ts', covers: ['late'], duration: 9, id: 'c1' },
        ],
        files: [{ file: '/t/a.test.ts', loadKills: ['early'] }],
      },
      { mutants: ['early', 'late', 'none'], isolate: true },
    )

    await runIsolatedRounds(session, state)

    expect(
      fake.calls.isolated.map(plan =>
        plan.units.map(unit => [unit.mutant, unit.file]),
      ),
    ).toStrictEqual([
      [
        ['early', '/t/a.test.ts'],
        ['late', '/t/a.test.ts'],
      ],
      [['late', '/t/b.test.ts']],
    ])
    expect(state.runs).toStrictEqual({ isolated: 2 })
    expect(state.mutants.get('late')!.verdict).toMatchObject({
      status: 'Killed',
      test: 'b1',
    })
  })

  it('doubles the files of each round after the second and runs every file of a survivor', async () => {
    let files = ['b', 'c', 'd', 'e', 'f', 'g', 'h']
    let { session, state, fake } = await createTestRun(
      {
        tests: files.map((name, index) => ({
          kills: name === 'e' ? { killed: 'boom' } : undefined,
          covers: ['kept', 'killed'],
          file: `/t/${name}.test.ts`,
          duration: index,
          id: name,
        })),
      },
      { mutants: ['kept', 'killed'], isolate: true },
    )

    await runIsolatedRounds(session, state)

    expect(
      fake.calls.isolated.map(plan =>
        plan.units.map(unit => `${unit.mutant} ${unit.file.slice(3, 4)}`),
      ),
    ).toStrictEqual([
      ['kept b', 'killed b'],
      ['kept c', 'killed c'],
      ['kept d', 'kept e', 'killed d', 'killed e'],
      ['kept f', 'kept g', 'kept h'],
    ])
    expect(state.mutants.get('killed')!.verdict).toMatchObject({
      status: 'Killed',
      test: 'e',
    })
    expect(state.mutants.get('kept')).toMatchObject({
      survived: true,
      verdict: null,
      units: 7,
    })
  })

  it('confirms a hit limit once with factor × floor more evaluations, however long the tests took', async () => {
    let stopped = createHitLimitError('m', 200_000).message
    let { session, state, fake } = await createTestRun(
      {
        tests: [
          {
            kills: { looped: stopped },
            covers: ['hot', 'looped'],
            file: '/t/a.test.ts',
            loops: ['looped'],
            duration: 1000,
            hot: ['hot'],
            id: 'a1',
          },
        ],
        files: [{ file: '/t/a.test.ts', loadDuration: 10 }],
      },
      { mutants: ['hot', 'looped'], isolate: true },
    )

    await runIsolatedRounds(session, state)

    /**
     * The test spends its second, as in a slow hook, without evaluating a site,
     * which leaves the room of the confirmation as it is.
     */
    expect(
      fake.calls.isolated.map(plan =>
        plan.units.map(unit => [unit.mutant, unit.limits]),
      ),
    ).toStrictEqual([
      [
        ['hot', { timeout: 280 + 3250, hitLimit: 200_000 }],
        ['looped', { timeout: 280 + 3250, hitLimit: 200_000 }],
      ],
      [
        [
          'hot',
          {
            hitLimit: 200_000 + 100 * 100_000,
            timeout: 2 * (280 + 3250),
          },
        ],
        [
          'looped',
          {
            hitLimit: 200_000 + 100 * 100_000,
            timeout: 2 * (280 + 3250),
          },
        ],
      ],
    ])
    expect(state.runs).toStrictEqual({ isolated: 2 })
    expect(state.mutants.get('hot')).toMatchObject({
      survived: true,
      verdict: null,
      units: 2,
    })
    expect(state.mutants.get('looped')!.verdict).toMatchObject({
      cause: 'hit-limit',
      status: 'Timeout',
      message: stopped,
      test: 'a1',
    })
  })

  it('confirms a hit limit that the confirmation of a timer went over, with the raised limit', async () => {
    let { session, state, fake } = await createTestRun(
      {
        onIsolated: (result, _plan, call) =>
          call === 1 ? result : (
            {
              units: result.units.map(facts => ({
                ...facts,
                tests: facts.tests.map(test => ({
                  ...test,
                  hits: 1_000_000,
                  timedOut: false,
                })),
                hits: 1_000_000,
              })),
            }
          ),
        tests: [
          { file: '/t/a.test.ts', covers: ['late'], hangs: ['late'], id: 'a1' },
        ],
      },
      { mutants: ['late'], isolate: true },
    )

    await runIsolatedRounds(session, state)

    /**
     * Its doubled time lets the test reach hot code past its wait.
     */
    expect(
      fake.calls.isolated.map(plan => plan.units.map(unit => unit.limits)),
    ).toStrictEqual([
      [{ hitLimit: 200_000, timeout: 503 }],
      [{ hitLimit: 200_000, timeout: 1006 }],
      [{ hitLimit: 200_000 + 100 * 100_000, timeout: 1006 }],
    ])
    expect(state.mutants.get('late')).toMatchObject({
      survived: true,
      verdict: null,
      units: 3,
    })
  })

  it('does nothing without isolated mutants', async () => {
    let { session, state, fake } = await createTestRun(
      { tests: [{ file: '/t/a.test.ts', covers: ['m1'], id: 'a1' }] },
      { mutants: ['m1'] },
    )

    await runIsolatedRounds(session, state)

    expect(fake.calls.isolated).toStrictEqual([])
    expect(state.runs).toStrictEqual({})
  })

  it('retries and confirms in later runs and gives up after the last', async () => {
    let { session, state, fake } = await createTestRun(
      {
        onIsolated: (result, plan) => ({
          units: result.units
            .filter(facts => plan.units[facts.unit]!.mutant !== 'lost')
            .map(facts =>
              plan.units[facts.unit]!.mutant === 'hung' ?
                { ...facts, incomplete: 'hang' as const }
              : facts,
            ),
        }),
        tests: [
          { covers: ['hung', 'lost'], file: '/t/a.test.ts', id: 'a1' },
          { file: '/t/b.test.ts', covers: ['hung'], duration: 3, id: 'b1' },
        ],
      },
      { mutants: ['hung', 'lost'], isolate: true },
    )

    await runIsolatedRounds(session, state)

    expect(
      fake.calls.isolated.map(plan =>
        plan.units.map(unit => [unit.mutant, unit.file]),
      ),
    ).toStrictEqual([
      [
        ['hung', '/t/a.test.ts'],
        ['lost', '/t/a.test.ts'],
      ],
      [
        ['hung', '/t/a.test.ts'],
        ['lost', '/t/a.test.ts'],
      ],
    ])
    expect(state.mutants.get('hung')!.verdict).toMatchObject({
      status: 'Timeout',
      cause: 'hang',
    })
    expect(state.mutants.get('lost')!.verdict).toMatchObject({
      message: 'The test runner did not report this mutant.',
      status: 'Error',
    })
  })

  it('tells at the start of each round how many of its mutants confirm a timeout, run again after a lost result or run with more test files', async () => {
    let { session, state } = await createTestRun(
      {
        onIsolated: (result, plan) => ({
          units: result.units
            .filter(facts => plan.units[facts.unit]!.mutant !== 'lost')
            .map(facts =>
              plan.units[facts.unit]!.mutant === 'hung' ?
                { ...facts, incomplete: 'hang' as const }
              : facts,
            ),
        }),
        tests: [
          { covers: ['hung', 'lost', 'kept'], file: '/t/a.test.ts', id: 'a1' },
          { file: '/t/b.test.ts', covers: ['kept'], id: 'b1' },
        ],
      },
      { mutants: ['hung', 'lost', 'kept'], isolate: true },
    )
    let starts: unknown[] = []
    state.report = event => {
      if (event.kind === 'run-start') {
        let { confirming, survivors, retrying, mutants, round } = event
        starts.push({ confirming, survivors, retrying, mutants, round })
      }
    }

    await runIsolatedRounds(session, state)

    expect(starts).toStrictEqual([
      { confirming: 0, survivors: 0, retrying: 0, mutants: 3, round: 1 },
      { confirming: 1, survivors: 1, retrying: 1, mutants: 3, round: 2 },
    ])
  })

  it('gives every unit a serial chain of its own only with parallel units', async () => {
    /**
     * Runs the rounds of three mutants that one test file covers and lists the
     * chains of each round as it starts.
     *
     * @param parallelUnits - Whether units of one test file run at once.
     * @returns Chains of the units of each round.
     */
    async function listChains(parallelUnits: boolean): Promise<number[][]> {
      let { session, state } = await createTestRun(
        {
          tests: [
            { covers: ['m1', 'm2', 'm3'], file: '/t/a.test.ts', id: 'a1' },
          ],
        },
        { mutants: ['m1', 'm2', 'm3'], isolate: true },
      )
      state.parallelUnits = parallelUnits
      let chains: number[][] = []
      state.report = event => {
        if (event.kind === 'run-start') {
          chains.push(event.chains)
        }
      }
      await runIsolatedRounds(session, state)
      return chains
    }

    await expect(listChains(false)).resolves.toStrictEqual([[0, 0, 0]])
    await expect(listChains(true)).resolves.toStrictEqual([[0, 1, 2]])
  })

  it('counts a mutant of a round once, as it runs again after a lost result rather than with more test files', async () => {
    let calls = 0
    let { session, state } = await createTestRun(
      {
        tests: [
          { file: '/t/a.test.ts', covers: ['lost'], id: 'a1' },
          { file: '/t/b.test.ts', covers: ['lost'], id: 'b1' },
        ],
        onIsolated: result => {
          calls += 1
          return calls === 1 ? { units: [] } : result
        },
      },
      { mutants: ['lost'], isolate: true },
    )
    let starts: unknown[] = []
    state.report = event => {
      if (event.kind === 'run-start') {
        let { confirming, survivors, retrying, mutants, round } = event
        starts.push({ confirming, survivors, retrying, mutants, round })
      }
    }

    await runIsolatedRounds(session, state)

    expect(starts).toStrictEqual([
      { confirming: 0, survivors: 0, retrying: 0, mutants: 1, round: 1 },
      { confirming: 0, survivors: 0, retrying: 1, mutants: 1, round: 2 },
    ])
  })

  it('counts the verdicts of the last round without facts of its units', async () => {
    let { session, state, fake } = await createTestRun(
      {
        onIsolated: result => ({
          units: result.units.map(facts => ({
            ...facts,
            incomplete: 'hang' as const,
          })),
        }),
        tests: [{ file: '/t/a.test.ts', covers: ['hung'], id: 'a1' }],
      },
      { mutants: ['hung'], isolate: true },
    )
    let events: (RunEvent | string)[] = []
    state.report = event => {
      events.push(event.kind === 'run-start' ? `run ${event.round}` : event)
    }
    fake.context!.onUnitEnd = end => {
      previewIsolatedUnit(state, { unit: end!.unit })
    }

    await runIsolatedRounds(session, state)

    expect(events).toStrictEqual([
      { kind: 'verdicts', survived: 0, timeout: 0, killed: 0, error: 0 },
      'run 1',
      'run 2',
      { kind: 'verdicts', survived: 0, timeout: 1, killed: 0, error: 0 },
    ])
  })

  it('confirms a timeout found in a later round in the round after it', async () => {
    let { session, state } = await createTestRun(
      {
        onIsolated: (result, plan, call) => ({
          units: result.units.map(facts =>
            call > 1 && plan.units[facts.unit]!.mutant === 'slow' ?
              { ...facts, incomplete: 'hang' as const }
            : facts,
          ),
        }),
        tests: [
          { covers: ['slow', 'kept'], file: '/t/a.test.ts', id: 'a1' },
          { covers: ['slow', 'kept'], file: '/t/b.test.ts', id: 'b1' },
          { covers: ['slow', 'kept'], file: '/t/c.test.ts', id: 'c1' },
        ],
      },
      { mutants: ['slow', 'kept'], isolate: true },
    )

    await runIsolatedRounds(session, state)

    expect(state.runs).toStrictEqual({ isolated: 3 })
    expect(state.mutants.get('slow')!.verdict).toMatchObject({
      file: '/t/b.test.ts',
      status: 'Timeout',
      cause: 'hang',
    })
    expect(state.mutants.get('kept')).toMatchObject({
      survived: true,
      verdict: null,
      units: 3,
    })
  })

  it('prefers a kill to a file the test runner never reported', async () => {
    let { session, state, fake } = await createTestRun(
      {
        tests: [
          { file: '/t/a.test.ts', covers: ['m1'], id: 'a1' },
          {
            kills: { m1: 'boom' },
            file: '/t/b.test.ts',
            covers: ['m1'],
            duration: 3,
            id: 'b1',
          },
        ],
        onIsolated: (result, plan) => ({
          units: result.units.filter(
            facts => plan.units[facts.unit]!.file !== '/t/a.test.ts',
          ),
        }),
      },
      { mutants: ['m1'], isolate: true },
    )

    await runIsolatedRounds(session, state)

    expect(
      fake.calls.isolated.map(plan =>
        plan.units.map(unit => unit.file.slice(3, 4)),
      ),
    ).toStrictEqual([['a'], ['a', 'b']])
    expect(state.mutants.get('m1')!.verdict).toMatchObject({
      status: 'Killed',
      test: 'b1',
    })
  })

  it('takes the verdict of the first decisive file whatever files ran together', async () => {
    /**
     * Runs a mutant that hangs in `c` and fails in `d`, with `a` and the given
     * extra files passing before them and `f` passing after them.
     *
     * @param extra - Names of extra passing files ordered between `a` and `c`.
     * @param workers - Test files expected to run at once.
     * @returns Final state and the units of every run.
     */
    async function run(
      extra: string[],
      workers: number,
    ): Promise<{ units: string[][]; verdict: unknown }> {
      let names = ['a', ...extra, 'c', 'd', 'f']
      let { session, state, fake } = await createTestRun(
        {
          onIsolated: (result, plan) => ({
            units: result.units.map(facts =>
              plan.units[facts.unit]!.file === '/t/c.test.ts' ?
                { ...facts, incomplete: 'hang' as const }
              : facts,
            ),
          }),
          tests: names.map(name => ({
            kills: name === 'd' ? { m1: 'boom' } : undefined,
            file: `/t/${name}.test.ts`,
            covers: ['m1'],
            id: name,
          })),
        },
        { mutants: ['m1'], isolate: true, workers },
      )
      await runIsolatedRounds(session, state)
      return {
        units: fake.calls.isolated.map(plan =>
          plan.units.map(unit => unit.file.slice(3, 4)),
        ),
        verdict: state.mutants.get('m1')!.verdict,
      }
    }
    let timeout = { file: '/t/c.test.ts', status: 'Timeout', cause: 'hang' }

    let alone = await run([], 4)
    let together = await run(['b'], 1)

    expect(alone.units).toStrictEqual([['a'], ['c'], ['c']])
    expect(together.units).toStrictEqual([['a'], ['b'], ['c', 'd'], ['c']])
    expect(alone.verdict).toMatchObject(timeout)
    expect(together.verdict).toMatchObject(timeout)
  })

  it('takes a later kill once a timeout is not confirmed', async () => {
    let { session, state, fake } = await createTestRun(
      {
        tests: [
          { file: '/t/a.test.ts', covers: ['m1'], id: 'a1' },
          { file: '/t/b.test.ts', covers: ['m1'], duration: 1, id: 'b1' },
          {
            kills: { m1: 'boom' },
            file: '/t/c.test.ts',
            covers: ['m1'],
            duration: 2,
            id: 'c1',
          },
        ],
        onIsolated: (result, plan, call) => ({
          units: result.units.map(facts =>
            call === 1 && plan.units[facts.unit]!.file === '/t/a.test.ts' ?
              { ...facts, incomplete: 'hang' as const }
            : facts,
          ),
        }),
      },
      { mutants: ['m1'], isolate: true, workers: 3 },
    )

    await runIsolatedRounds(session, state)

    expect(
      fake.calls.isolated.map(plan =>
        plan.units.map(unit => unit.file.slice(3, 4)),
      ),
    ).toStrictEqual([['a'], ['a'], ['b', 'c']])
    expect(state.mutants.get('m1')!.verdict).toMatchObject({
      status: 'Killed',
      test: 'c1',
    })
  })

  it.each<[string, (facts: IsolatedFacts) => IsolatedFacts]>([
    [
      'after its tests reached the mutant and passed',
      facts => ({ ...facts, incomplete: 'crash' }),
    ],
    [
      'before any test reached the mutant',
      facts => ({ ...facts, incomplete: 'crash', reached: false, tests: [] }),
    ],
  ])(
    'runs a unit once more when its process died %s, and takes the verdict of that run',
    async (_name, crash) => {
      /**
       * Something else killed the process, such as the OOM killer: `c2` reaches
       * the mutant and checks nothing, so a plain run passes.
       */
      let { session, state, fake } = await createTestRun(
        {
          tests: [
            { file: '/t/c.test.ts', id: 'c1' },
            { file: '/t/c.test.ts', covers: ['m'], id: 'c2' },
          ],
          onIsolated: (result, _plan, call) =>
            call === 1 ? { units: result.units.map(crash) } : result,
        },
        { mutants: ['m'], isolate: true },
      )

      await runIsolatedRounds(session, state)

      let mutant = state.mutants.get('m')!

      expect(
        fake.calls.isolated.map(plan => plan.units.map(unit => unit.mutant)),
      ).toStrictEqual([['m'], ['m']])
      expect(mutant).toMatchObject({ survived: true, verdict: null, units: 2 })
      expect(getFinalStatus(mutant)).toBe('Survived')
    },
  )

  it.each<[string, number]>([
    ['', 0],
    [' after the test runner lost its first run', 1],
  ])(
    'kills a mutant whose unit process dies again when it runs once more%s',
    async (_name, lost) => {
      let { session, state, fake } = await createTestRun(
        {
          onIsolated: (result, _plan, call) => ({
            units:
              call <= lost ?
                []
              : result.units.map(facts => ({
                  ...facts,
                  incomplete: 'crash' as const,
                })),
          }),
          tests: [{ file: '/t/a.test.ts', covers: ['m'], id: 'a1' }],
        },
        { mutants: ['m'], isolate: true },
      )

      await runIsolatedRounds(session, state)

      expect(fake.calls.isolated).toHaveLength(2 + lost)
      expect(state.mutants.get('m')!.verdict).toStrictEqual({
        file: '/t/a.test.ts',
        status: 'Killed',
        cause: 'crash',
        message: null,
        test: null,
      })
    },
  )

  it('runs a unit once more when its process died in the retry of a run the test runner lost, and takes the verdict of that run', async () => {
    let { session, state, fake } = await createTestRun(
      {
        onIsolated: (result, _plan, call) => {
          if (call === 1) {
            return { units: [] }
          }
          return call === 2 ?
              {
                units: result.units.map(facts => ({
                  ...facts,
                  incomplete: 'crash' as const,
                })),
              }
            : result
        },
        tests: [{ file: '/t/a.test.ts', covers: ['m'], id: 'a1' }],
      },
      { mutants: ['m'], isolate: true },
    )

    await runIsolatedRounds(session, state)

    expect(fake.calls.isolated).toHaveLength(3)
    expect(state.mutants.get('m')).toMatchObject({
      survived: true,
      verdict: null,
      units: 2,
    })
  })

  it('runs a crashed unit again with its limits as a retry, before any later file of its mutant', async () => {
    let { session, state, fake } = await createTestRun(
      {
        onIsolated: (result, _plan, call) =>
          call === 1 ?
            {
              units: result.units.map(facts => ({
                ...facts,
                incomplete: 'crash' as const,
              })),
            }
          : result,
        tests: [
          { file: '/t/a.test.ts', covers: ['m'], id: 'a1' },
          { file: '/t/b.test.ts', covers: ['m'], duration: 2, id: 'b1' },
        ],
      },
      { mutants: ['m'], isolate: true },
    )
    let starts: unknown[] = []
    state.report = event => {
      if (event.kind === 'run-start') {
        let { confirming, survivors, retrying, round } = event
        starts.push({ confirming, survivors, retrying, round })
      }
    }

    await runIsolatedRounds(session, state)

    expect(
      fake.calls.isolated.map(plan =>
        plan.units.map(unit => [unit.file.slice(3, 4), unit.limits]),
      ),
    ).toStrictEqual([
      [['a', { hitLimit: 200_000, timeout: 503 }]],
      [['a', { hitLimit: 200_000, timeout: 503 }]],
      [['b', { hitLimit: 200_000, timeout: 506 }]],
    ])
    expect(starts).toStrictEqual([
      { confirming: 0, survivors: 0, retrying: 0, round: 1 },
      { confirming: 0, survivors: 0, retrying: 1, round: 2 },
      { confirming: 0, survivors: 1, retrying: 0, round: 3 },
    ])
    expect(state.mutants.get('m')).toMatchObject({
      survived: true,
      verdict: null,
      units: 3,
    })
  })

  it('runs a confirmation whose process died once more with its doubled time, and takes the verdict of that run', async () => {
    /**
     * The first unit ran out of time on a busy machine, and something else
     * killed the process of its confirmation.
     */
    let { session, state, fake } = await createTestRun(
      {
        onIsolated: (result, _plan, call) => ({
          units: result.units.map(facts => {
            if (call === 1) {
              return {
                ...facts,
                tests: facts.tests.map(test => ({ ...test, timedOut: true })),
              }
            }
            return call === 2 ?
                { ...facts, incomplete: 'crash' as const }
              : facts
          }),
        }),
        tests: [{ file: '/t/a.test.ts', covers: ['m'], id: 'a1' }],
      },
      { mutants: ['m'], isolate: true },
    )

    await runIsolatedRounds(session, state)

    expect(
      fake.calls.isolated.map(plan => plan.units.map(unit => unit.limits)),
    ).toStrictEqual([
      [{ hitLimit: 200_000, timeout: 503 }],
      [{ hitLimit: 200_000, timeout: 1006 }],
      [{ hitLimit: 200_000, timeout: 1006 }],
    ])
    expect(state.mutants.get('m')).toMatchObject({
      survived: true,
      verdict: null,
      units: 3,
    })
  })
})
