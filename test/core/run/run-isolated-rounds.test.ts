import { describe, expect, it } from 'vitest'

import { runIsolatedRounds } from '../../../core/run/run-isolated-rounds'
import { createTestRun } from '../../helpers/create-test-run'

describe('runIsolatedRounds', () => {
  it('runs the cheapest file first and the other files for survivors', async () => {
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
      [
        ['late', '/t/b.test.ts'],
        ['late', '/t/c.test.ts'],
      ],
    ])
    expect(state.runs).toStrictEqual({ isolated: 2 })
    expect(state.mutants.get('late')!.verdict).toMatchObject({
      status: 'Killed',
      test: 'b1',
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
        ['hung', '/t/b.test.ts'],
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

  it('gives up on timeouts that no run is left to confirm', async () => {
    let { session, state } = await createTestRun(
      {
        onIsolated: (result, plan, call) => ({
          units: result.units
            .filter(() => call < 3)
            .map(facts =>
              call === 2 && plan.units[facts.unit]!.mutant === 'slow' ?
                { ...facts, incomplete: 'hang' as const }
              : facts,
            ),
        }),
        tests: [
          { covers: ['slow', 'gone'], file: '/t/a.test.ts', id: 'a1' },
          { covers: ['slow', 'gone'], file: '/t/b.test.ts', id: 'b1' },
        ],
      },
      { mutants: ['slow', 'gone'], isolate: true },
    )

    await runIsolatedRounds(session, state)

    expect(state.runs).toStrictEqual({ isolated: 3 })
    expect(state.mutants.get('slow')!.verdict).toMatchObject({
      message: 'A timeout could not be confirmed: no isolated run was left.',
      status: 'Error',
    })
    expect(state.mutants.get('gone')).toMatchObject({
      survived: true,
      verdict: null,
    })
  })

  it('gives up on a timeout found in the last run', async () => {
    let { session, state } = await createTestRun(
      {
        onIsolated: (result, plan, call) => ({
          units: result.units
            .filter(
              facts => call !== 2 || plan.units[facts.unit]!.mutant !== 'lost',
            )
            .map(facts =>
              call === 3 && plan.units[facts.unit]!.mutant === 'lost' ?
                { ...facts, incomplete: 'hang' as const }
              : facts,
            ),
        }),
        tests: [
          { covers: ['lost', 'late'], file: '/t/a.test.ts', id: 'a1' },
          { covers: ['lost', 'late'], file: '/t/b.test.ts', id: 'b1' },
        ],
      },
      { mutants: ['lost', 'late'], isolate: true },
    )

    await runIsolatedRounds(session, state)

    expect(state.runs).toStrictEqual({ isolated: 3 })
    expect(state.mutants.get('lost')!.verdict).toMatchObject({
      message: 'A timeout could not be confirmed: no isolated run was left.',
      status: 'Error',
    })
    expect(state.mutants.get('late')!.survived).toBe(true)
  })

  it('keeps a verdict reached after a unit went missing in the last run', async () => {
    let { session, state } = await createTestRun(
      {
        onIsolated: (result, plan, call) => ({
          units: result.units
            .filter(facts => {
              let { file } = plan.units[facts.unit]!
              return (
                (call === 2 && file === '/t/a.test.ts') ||
                (call === 3 && file === '/t/b.test.ts')
              )
            })
            .map(facts =>
              call === 2 ? { ...facts, incomplete: 'hang' as const } : facts,
            ),
        }),
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
      },
      { mutants: ['m1'], isolate: true },
    )

    await runIsolatedRounds(session, state)

    expect(state.runs).toStrictEqual({ isolated: 3 })
    expect(state.mutants.get('m1')!.verdict).toMatchObject({
      status: 'Killed',
      test: 'b1',
    })
  })
})
