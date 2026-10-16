import { describe, expect, it } from 'vitest'

import type { FakeWorld } from '../../helpers/create-fake-adapter'

import { runBatchPhases } from '../../../core/run/run-batch-phases'
import { createTestRun } from '../../helpers/create-test-run'

/**
 * Runs the batch phases over a simulated project.
 *
 * @param world - Simulated project.
 * @param mutants - Ids of the pending mutants.
 * @param workers - Test files expected to run at once.
 * @returns State and fake adapter after the phases, and the progress lines.
 */
async function run(
  world: FakeWorld,
  mutants: string[],
  workers = 1,
): Promise<Awaited<ReturnType<typeof createTestRun>> & { progress: string[] }> {
  let test = await createTestRun(world, { workers, mutants })
  let progress: string[] = []
  test.state.report = event => {
    if (event.kind === 'run-start') {
      progress.push(
        `${event.run} ${event.round}: ${event.mutants} mutants, ${event.units} units`,
      )
    }
  }
  await runBatchPhases(test.session, test.state)
  return { ...test, progress }
}

describe('runBatchPhases', () => {
  it('tries the cheapest test first, the others for survivors, then isolates survivors', async () => {
    let { state, fake } = await run(
      {
        tests: [
          {
            covers: ['early', 'late', 'lasting', 'nowhere'],
            file: '/t/a.test.ts',
            id: 'cheap',
          },
          {
            covers: ['early', 'late', 'lasting', 'nowhere'],
            kills: { late: 'boom' },
            file: '/t/b.test.ts',
            duration: 5,
            id: 'dear',
          },
        ],
        onBatch: result => ({
          ...result,
          tries: result.tries.map(facts =>
            facts.mutant === 'nowhere' ? { ...facts, reached: false } : facts,
          ),
        }),
      },
      ['early', 'late', 'lasting', 'nowhere'],
    )

    expect(
      fake.calls.batch.map(plan => plan.units.map(unit => unit.file)),
    ).toStrictEqual([['/t/a.test.ts'], ['/t/b.test.ts']])
    expect(state.runs).toStrictEqual({ batch: 2 })
    expect(state.mutants.get('late')!.verdict).toMatchObject({
      status: 'Killed',
      test: 'dear',
    })
    expect(state.mutants.get('lasting')).toMatchObject({
      files: ['/t/a.test.ts', '/t/b.test.ts'],
      isolatedBecause: 'batch-survivor',
      path: 'isolated',
      survived: false,
      verdict: null,
    })
    expect(state.mutants.get('nowhere')).toMatchObject({
      isolatedBecause: 'doubtful',
      path: 'isolated',
    })
  })

  it('skips phase 2 when nothing is left', async () => {
    let { state } = await run(
      {
        tests: [
          {
            kills: { m1: 'boom' },
            file: '/t/a.test.ts',
            covers: ['m1'],
            id: 't1',
          },
        ],
      },
      ['m1'],
    )

    expect(state.runs).toStrictEqual({ batch: 1 })
  })

  it('plans missing tries again, then isolates them', async () => {
    let { state } = await run(
      {
        onBatch: (result, _plan, call) => ({
          ...result,
          tries: result.tries.filter(
            facts =>
              facts.mutant !== 'lost' && (facts.mutant !== 'found' || call > 1),
          ),
          incomplete: [{ message: 'fork died', reason: 'crash', unit: 0 }],
        }),
        tests: [{ covers: ['lost', 'found'], file: '/t/a.test.ts', id: 't1' }],
      },
      ['lost', 'found'],
    )

    expect(state.runs).toStrictEqual({ recovery: 2, batch: 1 })
    expect(state.mutants.get('found')).toMatchObject({
      isolatedBecause: 'batch-survivor',
      path: 'isolated',
    })
    expect(state.mutants.get('lost')).toMatchObject({
      isolatedBecause: 'recovery',
      path: 'isolated',
    })
    expect(state.diagnostics).toStrictEqual([
      {
        message:
          'Batch tries in t/a.test.ts went missing in 2 recovery runs (fork died); their mutants run isolated.',
        code: 'worker-crash',
        file: 't/a.test.ts',
        severity: 'warning',
        column: null,
        line: null,
      },
    ])
  })

  it('reports missing tries without a cause when no unit was incomplete', async () => {
    let { state } = await run(
      {
        onBatch: result => ({
          ...result,
          tries: result.tries.filter(facts => facts.mutant !== 'lost'),
        }),
        tests: [{ file: '/t/a.test.ts', covers: ['lost'], id: 't1' }],
      },
      ['lost'],
    )

    expect(state.diagnostics[0]!.message).toBe(
      'Batch tries in t/a.test.ts went missing in 2 recovery runs; their mutants run isolated.',
    )
  })

  it('confirms timeouts with doubled bounds and half the workers', async () => {
    let { progress, state, fake } = await run(
      {
        onBatch: (result, _plan, call) =>
          call === 2 ?
            {
              ...result,
              tries: result.tries
                .filter(facts => facts.mutant !== 'lost')
                .map(facts =>
                  facts.mutant === 'quick' || facts.mutant === 'lone' ?
                    { ...facts, timedOut: false }
                  : facts,
                ),
            }
          : result,
        tests: [
          {
            covers: ['slow', 'quick', 'lost', 'lone'],
            hangs: ['slow', 'quick', 'lost', 'lone'],
            file: '/t/a.test.ts',
            id: 't1',
          },
          {
            covers: ['slow', 'quick', 'lost'],
            file: '/t/a.test.ts',
            duration: 2,
            id: 't2',
          },
        ],
      },
      ['slow', 'quick', 'lost', 'lone'],
      4,
    )

    expect(state.runs).toStrictEqual({ confirmation: 1, batch: 1 })
    expect(progress).toStrictEqual([
      'batch 1: 4 mutants, 1 units',
      'confirmation 1: 4 mutants, 1 units',
    ])
    expect(fake.calls.batch.map(plan => plan.concurrency)).toStrictEqual([4, 2])
    expect(fake.calls.batch[1]!.units[0]!.tests[0]!.timeout).toBe(506)
    expect(state.mutants.get('slow')!.verdict).toMatchObject({
      cause: 'time-limit',
      status: 'Timeout',
    })
    expect(state.mutants.get('quick')).toMatchObject({
      isolatedBecause: 'batch-survivor',
      path: 'isolated',
    })
    expect(state.mutants.get('lone')).toMatchObject({
      isolatedBecause: 'batch-survivor',
      path: 'isolated',
    })
    expect(state.mutants.get('lost')).toMatchObject({
      isolatedBecause: 'recovery',
    })
  })
})
