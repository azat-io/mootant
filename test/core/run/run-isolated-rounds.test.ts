import { describe, expect, it } from 'vitest'

import type { RunEvent } from '../../../types/run/run-event'

import { previewIsolatedUnit } from '../../../core/run/preview-isolated-unit'
import { runIsolatedRounds } from '../../../core/run/run-isolated-rounds'
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
     * Runs a mutant that hangs in `b` and fails in `c`, with `a` and the given
     * extra files passing before them and `e` passing after them; `b`, `c` and
     * `e` cost the same.
     *
     * @param extra - Names of extra passing files cheaper than `b`.
     * @param workers - Test files expected to run at once.
     * @returns Final state and the units of every run.
     */
    async function run(
      extra: string[],
      workers: number,
    ): Promise<{ units: string[][]; verdict: unknown }> {
      let names = ['a', ...extra, 'b', 'c', 'e']
      let { session, state, fake } = await createTestRun(
        {
          tests: names.map((name, index) => ({
            kills: name === 'c' ? { m1: 'boom' } : undefined,
            duration: Math.min(index, extra.length + 1),
            file: `/t/${name}.test.ts`,
            covers: ['m1'],
            id: name,
          })),
          onIsolated: (result, plan) => ({
            units: result.units.map(facts =>
              plan.units[facts.unit]!.file === '/t/b.test.ts' ?
                { ...facts, incomplete: 'hang' as const }
              : facts,
            ),
          }),
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
    let timeout = { file: '/t/b.test.ts', status: 'Timeout', cause: 'hang' }

    let alone = await run([], 4)
    let together = await run(['d'], 1)

    expect(alone.units).toStrictEqual([['a'], ['b'], ['b']])
    expect(together.units).toStrictEqual([['a'], ['d'], ['b', 'c'], ['b']])
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
})
