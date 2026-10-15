import { describe, expect, it } from 'vitest'

import type { IsolatedFacts } from '../../../types/adapter/isolated-result'
import type { IsolatedRequest } from '../../../types/run/run-state'
import type { FakeWorld } from '../../helpers/create-fake-adapter'

import { applyIsolatedResult } from '../../../core/run/apply-isolated-result'
import { planIsolated } from '../../../core/run/plan-isolated'
import { createTestRun } from '../../helpers/create-test-run'

/**
 * Runs one isolated unit per mutant in `/t/a.test.ts` and records the result.
 *
 * @param world - Simulated project.
 * @param mutants - Ids of the pending mutants, each run once.
 * @param options - Changes to the units and requests.
 * @param options.change - Changes the facts of a unit, or drops them with null.
 * @param options.request - Fields of the requests that differ from a first,
 *   unconfirmed run.
 * @returns State after the run and the requests for the next one.
 */
async function apply(
  world: FakeWorld,
  mutants: string[],
  options: {
    change?(facts: IsolatedFacts): IsolatedFacts | null
    request?: Partial<IsolatedRequest>
  } = {},
): Promise<{
  state: Awaited<ReturnType<typeof createTestRun>>['state']
  next: IsolatedRequest[]
}> {
  let { session, state } = await createTestRun(world, {
    isolate: true,
    mutants,
  })
  let requests = mutants.map(mutant => ({
    file: '/t/a.test.ts',
    confirming: false,
    retried: false,
    mutant,
    ...options.request,
  }))
  let plan = planIsolated(state, requests)
  let result = await session.runIsolated(plan)
  let units = result.units
    .map(facts => options.change?.(facts) ?? facts)
    .filter(facts => facts.unit >= 0)
  let next = applyIsolatedResult(state, { requests, plan }, { units })
  return { state, next }
}

describe('applyIsolatedResult', () => {
  it('kills on failures, load errors, crashes and stray errors', async () => {
    let { state, next } = await apply(
      {
        tests: [
          {
            covers: ['passed', 'stray', 'crash'],
            file: '/t/a.test.ts',
            id: 'a1',
          },
          {
            covers: ['failed', 'passed', 'stray', 'crash'],
            kills: { failed: 'expected 1 to be 2' },
            file: '/t/a.test.ts',
            duration: 3,
            id: 'a2',
          },
        ],
        files: [{ loadKills: ['loading'], file: '/t/a.test.ts' }],
      },
      ['failed', 'loading', 'crash', 'stray', 'passed'],
      {
        change: facts => {
          if (facts.unit === 2) {
            return { ...facts, incomplete: 'crash' }
          }
          if (facts.unit === 3) {
            return { ...facts, strays: ['late boom'] }
          }
          return facts
        },
      },
    )

    expect(next).toStrictEqual([])
    expect(state.mutants.get('failed')).toMatchObject({
      verdict: {
        message: 'expected 1 to be 2',
        file: '/t/a.test.ts',
        cause: 'assertion',
        status: 'Killed',
        test: 'a2',
      },
      unitDuration: 4,
      duration: 4,
      units: 1,
      tries: 1,
    })
    expect(state.mutants.get('loading')!.verdict).toStrictEqual({
      file: '/t/a.test.ts',
      message: 'load boom',
      cause: 'load-error',
      status: 'Killed',
      test: null,
    })
    expect(state.mutants.get('crash')!.verdict).toMatchObject({
      status: 'Killed',
      cause: 'crash',
      test: null,
    })
    expect(state.mutants.get('stray')!.verdict).toMatchObject({
      cause: 'stray-error',
      message: 'late boom',
      status: 'Killed',
    })
    expect(state.mutants.get('passed')).toMatchObject({
      survived: true,
      verdict: null,
    })
  })

  it('stops loops and waits to confirm hangs and slow tests', async () => {
    let { state, next } = await apply(
      {
        tests: [
          {
            covers: ['looped', 'slow', 'hung'],
            file: '/t/a.test.ts',
            loops: ['looped'],
            hangs: ['slow'],
            id: 'a1',
          },
        ],
      },
      ['looped', 'slow', 'hung'],
      {
        change: facts =>
          facts.unit === 2 ? { ...facts, incomplete: 'hang' } : facts,
      },
    )

    expect(state.mutants.get('looped')!.verdict).toMatchObject({
      cause: 'hit-limit',
      status: 'Timeout',
      test: null,
    })
    expect(next).toStrictEqual([
      {
        file: '/t/a.test.ts',
        confirming: true,
        retried: false,
        mutant: 'slow',
      },
      {
        file: '/t/a.test.ts',
        confirming: true,
        retried: false,
        mutant: 'hung',
      },
    ])
    expect(state.diagnostics).toStrictEqual([
      {
        message:
          'The worker running t/a.test.ts with mutant hung stopped responding and was stopped.',
        code: 'worker-hang',
        file: 't/a.test.ts',
        severity: 'warning',
        column: null,
        line: null,
      },
    ])
  })

  it('makes timeouts final when the unit confirms one', async () => {
    let { state } = await apply(
      {
        tests: [
          {
            kills: { looped: 'MootantHitLimitError' },
            covers: ['slow', 'hung', 'looped'],
            file: '/t/a.test.ts',
            loops: ['looped'],
            hangs: ['slow'],
            id: 'a1',
          },
        ],
      },
      ['slow', 'hung', 'looped'],
      {
        change: facts =>
          facts.unit === 1 ? { ...facts, incomplete: 'hang' } : facts,
        request: { confirming: true },
      },
    )

    expect(state.mutants.get('slow')!.verdict).toMatchObject({
      cause: 'time-limit',
      status: 'Timeout',
      test: 'a1',
    })
    expect(state.mutants.get('hung')!.verdict).toMatchObject({
      status: 'Timeout',
      cause: 'hang',
    })
    expect(state.mutants.get('looped')!.verdict).toMatchObject({
      message: 'MootantHitLimitError',
      cause: 'hit-limit',
      test: 'a1',
    })
  })

  it('ignores failures of a unit that never reached its mutant', async () => {
    let { state } = await apply(
      {
        tests: [
          { file: '/t/a.test.ts', firstOnly: ['m1'], id: 'a1' },
          { file: '/t/a.test.ts', id: 'a2' },
        ],
      },
      ['m1'],
      {
        change: facts => ({
          ...facts,
          tests: facts.tests.map(test => ({ ...test, failed: true })),
        }),
      },
    )

    expect(state.mutants.get('m1')).toMatchObject({
      survived: false,
      verdict: null,
      units: 1,
    })
  })

  it('plans a missing unit once more, then gives up', async () => {
    let world: FakeWorld = {
      tests: [{ file: '/t/a.test.ts', covers: ['m1'], id: 'a1' }],
    }
    let first = await apply(world, ['m1'], {
      change: facts => ({ ...facts, unit: -1 }),
    })
    let second = await apply(world, ['m1'], {
      change: facts => ({ ...facts, unit: -1 }),
      request: { retried: true },
    })

    expect(first.next).toStrictEqual([
      { file: '/t/a.test.ts', confirming: false, retried: true, mutant: 'm1' },
    ])
    expect(second.next).toStrictEqual([])
    expect(second.state.mutants.get('m1')!.verdict).toStrictEqual({
      message: 'The test runner did not report this mutant.',
      status: 'Error',
      cause: null,
      file: null,
      test: null,
    })
  })

  it('records later units of a decided mutant without changing it', async () => {
    let { session, state } = await createTestRun(
      {
        tests: [
          {
            kills: { m1: 'boom' },
            file: '/t/a.test.ts',
            covers: ['m1'],
            id: 'a1',
          },
          { file: '/t/b.test.ts', covers: ['m1'], id: 'b1' },
        ],
      },
      { mutants: ['m1'], isolate: true },
    )
    let requests = ['/t/a.test.ts', '/t/b.test.ts', '/t/b.test.ts'].map(
      file => ({ confirming: false, retried: false, mutant: 'm1', file }),
    )
    let plan = planIsolated(state, requests)
    let result = await session.runIsolated(plan)

    let next = applyIsolatedResult(
      state,
      { requests, plan },
      { units: result.units.slice(0, 2) },
    )

    expect(next).toStrictEqual([])
    expect(state.mutants.get('m1')).toMatchObject({
      verdict: { status: 'Killed', test: 'a1' },
      survived: false,
      units: 2,
    })
  })

  it('proves nothing with stray errors the dry run already had', async () => {
    let { state } = await apply(
      {
        onDry: result => ({
          ...result,
          tests: result.tests.map(test =>
            test.id === 'a1' ?
              {
                ...test,
                tries: test.tries.map(facts => ({
                  ...facts,
                  strays: ['stray'],
                })),
              }
            : test,
          ),
          files: result.files.map(file => ({ ...file, errors: ['outside'] })),
        }),
        tests: [
          { file: '/t/a.test.ts', covers: ['m1'], id: 'a1' },
          { file: '/t/a.test.ts', covers: ['m1'], id: 'a2' },
        ],
      },
      ['m1'],
      {
        change: facts => ({
          ...facts,
          tests: facts.tests.map(test =>
            test.test === 'a1' ? { ...test, strays: ['stray'] } : test,
          ),
          strays: ['outside'],
        }),
      },
    )

    expect(state.mutants.get('m1')).toMatchObject({
      survived: true,
      verdict: null,
    })
  })

  it('kills on a stray error only once the mutant was reached', async () => {
    let { state } = await apply(
      {
        tests: [
          { file: '/t/a.test.ts', id: 'a1' },
          { covers: ['early', 'late'], file: '/t/a.test.ts', id: 'a2' },
        ],
      },
      ['early', 'late'],
      {
        change: facts => ({
          ...facts,
          tests: facts.tests.map(test =>
            test.test === 'a1' || facts.unit === 1 ?
              { ...test, strays: [`${test.test} stray`] }
            : test,
          ),
        }),
      },
    )

    expect(state.mutants.get('early')).toMatchObject({
      survived: true,
      verdict: null,
    })
    expect(state.mutants.get('late')!.verdict).toStrictEqual({
      file: '/t/a.test.ts',
      cause: 'stray-error',
      message: 'a2 stray',
      status: 'Killed',
      test: 'a2',
    })
  })

  it('kills a static mutant in a test that ran after loading reached it', async () => {
    let { state } = await apply(
      {
        files: [{ file: '/t/a.test.ts', loadCovers: ['m1'] }],
        tests: [{ file: '/t/a.test.ts', id: 'a1' }],
      },
      ['m1'],
      {
        change: facts => ({
          ...facts,
          tests: facts.tests.map(test => ({
            ...test,
            message: 'expected 1 to be 2',
            failed: true,
          })),
        }),
      },
    )

    expect(state.mutants.get('m1')!.verdict).toMatchObject({
      message: 'expected 1 to be 2',
      cause: 'assertion',
      status: 'Killed',
      test: 'a1',
    })
  })

  it('waits to confirm a suite hook that ran out of time', async () => {
    let { state, next } = await apply(
      { tests: [{ file: '/t/a.test.ts', covers: ['slow'], id: 'a1' }] },
      ['slow', 'unreached'],
      {
        change: facts => ({
          ...facts,
          hookError: 'Hook timed out in 519ms.',
          reached: facts.unit === 0,
          timedOut: true,
          tests: [],
        }),
      },
    )

    expect(next).toStrictEqual([
      {
        file: '/t/a.test.ts',
        confirming: true,
        retried: false,
        mutant: 'slow',
      },
    ])
    expect(state.mutants.get('unreached')).toMatchObject({
      survived: false,
      verdict: null,
    })
  })

  it('makes a suite hook timeout final when the unit confirms one', async () => {
    let { state } = await apply(
      { tests: [{ file: '/t/a.test.ts', covers: ['slow'], id: 'a1' }] },
      ['slow'],
      {
        change: facts => ({
          ...facts,
          hookError: 'Hook timed out in 519ms.',
          timedOut: true,
          reached: true,
          tests: [],
        }),
        request: { confirming: true },
      },
    )

    expect(state.mutants.get('slow')!.verdict).toStrictEqual({
      message: 'Hook timed out in 519ms.',
      file: '/t/a.test.ts',
      cause: 'time-limit',
      status: 'Timeout',
      test: null,
    })
  })

  it('kills on a suite hook error once the unit reached the mutant', async () => {
    let { state } = await apply(
      {
        tests: [
          { covers: ['spoils', 'elsewhere'], file: '/t/a.test.ts', id: 'a1' },
        ],
        files: [{ hookKills: ['spoils', 'unreached'], file: '/t/a.test.ts' }],
      },
      ['spoils', 'unreached'],
    )

    expect(state.mutants.get('spoils')!.verdict).toStrictEqual({
      file: '/t/a.test.ts',
      message: 'hook boom',
      cause: 'hook-error',
      status: 'Killed',
      test: null,
    })
    expect(state.mutants.get('unreached')).toMatchObject({
      survived: false,
      verdict: null,
    })
  })
})
