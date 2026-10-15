import { describe, expect, it } from 'vitest'

import type { BatchResult } from '../../../types/adapter/batch-result'
import type { FakeWorld } from '../../helpers/create-fake-adapter'
import type { TryFacts } from '../../../types/adapter/try-facts'
import type { PlannedTry } from '../../../types/run/run-state'

import { applyBatchResult } from '../../../core/run/apply-batch-result'
import { createTestRun } from '../../helpers/create-test-run'
import { planBatch } from '../../../core/run/plan-batch'

/**
 * Runs batch tries over a simulated project and records the result.
 *
 * @param world - Simulated project.
 * @param tries - Tries to plan; every mutant tries in `t1` when omitted.
 * @param options - Mutants, a change to the result, and whether the run
 *   confirms timeouts.
 * @param options.mutants - Ids of the pending mutants.
 * @param options.change - Changes the reported result.
 * @param options.confirming - Whether the run confirms timeouts.
 * @returns State after the run and the missing tries.
 */
async function apply(
  world: FakeWorld,
  tries: PlannedTry[],
  options: {
    change?(result: BatchResult): BatchResult
    confirming?: boolean
    mutants: string[]
  },
): Promise<{
  state: Awaited<ReturnType<typeof createTestRun>>['state']
  missing: PlannedTry[]
}> {
  let { session, state } = await createTestRun(world, options)
  let plan = planBatch(state, tries, 1)
  let result = await session.runBatch(plan)
  let missing = applyBatchResult(state, {
    result: options.change?.(result) ?? result,
    confirming: options.confirming ?? false,
    plan,
  })
  return { missing, state }
}

/**
 * Changes to the control tries of the hang test, by test id.
 */
const HUNG_CONTROLS: Record<string, Partial<TryFacts>> = {
  d1: { timedOut: true, test: 'ghost' },
  b1: { timedOut: true },
}

describe('applyBatchResult', () => {
  it('records kills, passes, hit limits and timeouts to confirm', async () => {
    let { missing, state } = await apply(
      {
        tests: [
          {
            covers: ['killed', 'survived', 'looped', 'slow'],
            kills: { killed: 'expected 1 to be 2' },
            file: '/t/a.test.ts',
            loops: ['looped'],
            hangs: ['slow'],
            duration: 2,
            id: 't1',
          },
          {
            covers: ['unreached'],
            file: '/t/a.test.ts',
            id: 't2',
          },
        ],
      },
      ['killed', 'survived', 'looped', 'slow', 'unreached'].map(mutant => ({
        test: 't1',
        mutant,
      })),
      { mutants: ['killed', 'survived', 'looped', 'slow', 'unreached'] },
    )

    expect(missing).toStrictEqual([])
    expect(state.mutants.get('killed')).toMatchObject({
      verdict: {
        message: 'expected 1 to be 2',
        file: '/t/a.test.ts',
        cause: 'assertion',
        status: 'Killed',
        test: 't1',
      },
      duration: 2,
      tries: 1,
    })
    expect(state.mutants.get('survived')).toMatchObject({
      survived: true,
      verdict: null,
    })
    expect(state.mutants.get('looped')!.verdict).toMatchObject({
      cause: 'hit-limit',
      status: 'Timeout',
    })
    expect(state.mutants.get('slow')).toMatchObject({
      confirm: [{ cause: 'time-limit', test: 't1' }],
      verdict: null,
    })
    expect(state.mutants.get('unreached')).toMatchObject({
      survived: false,
      path: 'batch',
      verdict: null,
    })
  })

  it('makes timeouts final in a confirmation run', async () => {
    let { state } = await apply(
      {
        tests: [
          { file: '/t/a.test.ts', covers: ['slow'], hangs: ['slow'], id: 't1' },
        ],
      },
      [{ mutant: 'slow', test: 't1' }],
      { mutants: ['slow'], confirming: true },
    )

    expect(state.mutants.get('slow')).toMatchObject({
      verdict: { cause: 'time-limit', status: 'Timeout' },
      confirm: [],
    })
  })

  it('trusts a kill only between two passing controls', async () => {
    let { state } = await apply(
      {
        tests: [
          {
            covers: ['k1', 'k2', 's1', 'm4', 'h1'],
            kills: { k1: 'boom', k2: 'boom' },
            file: '/t/a.test.ts',
            strays: ['m4'],
            hangs: ['h1'],
            id: 't1',
          },
          {
            covers: ['k3', 's2', 'l1'],
            kills: { k3: 'boom' },
            file: '/t/a.test.ts',
            loops: ['l1'],
            id: 't2',
          },
        ],
      },
      [
        { mutant: 'k1', test: 't1' },
        { mutant: 'k2', test: 't1' },
        { mutant: 's1', test: 't1' },
        { mutant: 'm4', test: 't1' },
        { mutant: 'h1', test: 't1' },
        { mutant: 'k3', test: 't2' },
        { mutant: 's2', test: 't2' },
        { mutant: 'l1', test: 't2' },
      ],
      {
        change: result => {
          let positions = new Map<string, number>()
          return {
            ...result,
            tries: result.tries.map(facts => {
              let position = positions.get(facts.test) ?? 0
              positions.set(facts.test, position + 1)
              let bad =
                (facts.test === 't1' && (position === 0 || position === 10)) ||
                (facts.test === 't2' && (position === 2 || position === 6))
              return bad ? { ...facts, failed: true } : facts
            }),
          }
        },
        mutants: ['k1', 'k2', 's1', 'm4', 'h1', 'k3', 's2', 'l1'],
      },
    )

    expect(state.mutants.get('k1')).toMatchObject({
      isolatedBecause: 'doubtful',
      path: 'isolated',
      verdict: null,
    })
    expect(state.mutants.get('k2')!.verdict).toMatchObject({
      cause: 'assertion',
      status: 'Killed',
    })
    expect(state.mutants.get('s1')).toMatchObject({
      survived: true,
      path: 'batch',
    })
    expect(state.mutants.get('m4')!.path).toBe('isolated')
    expect(state.mutants.get('h1')).toMatchObject({
      confirm: [{ cause: 'time-limit', test: 't1' }],
      path: 'batch',
    })
    expect(state.mutants.get('k3')).toMatchObject({
      isolatedBecause: 'doubtful',
      verdict: null,
    })
    expect(state.mutants.get('s2')).toMatchObject({
      survived: true,
      path: 'batch',
    })
    expect(state.mutants.get('l1')).toMatchObject({
      isolatedBecause: 'doubtful',
      verdict: null,
    })
  })

  it('doubts a kill without a control after it', async () => {
    let { state } = await apply(
      {
        tests: [
          {
            kills: { k1: 'boom' },
            file: '/t/a.test.ts',
            covers: ['k1'],
            id: 't1',
          },
        ],
      },
      [{ mutant: 'k1', test: 't1' }],
      {
        change: result => ({ ...result, tries: result.tries.slice(0, 2) }),
        mutants: ['k1'],
      },
    )

    expect(state.mutants.get('k1')).toMatchObject({
      isolatedBecause: 'doubtful',
      verdict: null,
    })
  })

  it('doubts a timeout after a control that did not pass, even when confirming', async () => {
    let { state } = await apply(
      {
        tests: [
          { file: '/t/a.test.ts', covers: ['h1'], hangs: ['h1'], id: 't1' },
        ],
      },
      [{ mutant: 'h1', test: 't1' }],
      {
        change: result => ({
          ...result,
          tries: result.tries.map((facts, index) =>
            index === 0 ? { ...facts, failed: true } : facts,
          ),
        }),
        confirming: true,
        mutants: ['h1'],
      },
    )

    expect(state.mutants.get('h1')).toMatchObject({
      isolatedBecause: 'doubtful',
      path: 'isolated',
      verdict: null,
      confirm: [],
    })
  })

  it('isolates the undecided mutants of a unit whose suite hook failed', async () => {
    let { missing, state } = await apply(
      {
        tests: [
          {
            covers: ['spoils', 'passes', 'killed'],
            kills: { killed: 'boom' },
            file: '/t/a.test.ts',
            id: 'a1',
          },
          { file: '/t/b.test.ts', covers: ['other'], id: 'b1' },
        ],
        files: [{ hookKills: ['spoils'], file: '/t/a.test.ts' }],
      },
      [
        { mutant: 'spoils', test: 'a1' },
        { mutant: 'passes', test: 'a1' },
        { mutant: 'killed', test: 'a1' },
        { mutant: 'other', test: 'b1' },
      ],
      { mutants: ['spoils', 'passes', 'killed', 'other'] },
    )

    expect(missing).toStrictEqual([])
    expect(state.mutants.get('spoils')).toMatchObject({
      isolatedBecause: 'doubtful',
      path: 'isolated',
      survived: false,
    })
    expect(state.mutants.get('passes')!.path).toBe('isolated')
    expect(state.mutants.get('killed')).toMatchObject({
      verdict: { status: 'Killed' },
      path: 'batch',
    })
    expect(state.mutants.get('other')).toMatchObject({
      survived: true,
      path: 'batch',
    })
  })

  it('names the hung try and gives its timeout the cause hang', async () => {
    let { state } = await apply(
      {
        tests: [
          { file: '/t/a.test.ts', covers: ['m1'], hangs: ['m1'], id: 't1' },
          { file: '/t/b.test.ts', covers: ['m2'], id: 'b1' },
          { file: '/t/c.test.ts', covers: ['m3'], id: 'c1' },
          { file: '/t/d.test.ts', covers: ['m4'], id: 'd1' },
        ],
      },
      [
        { mutant: 'm1', test: 't1' },
        { mutant: 'm2', test: 'b1' },
        { mutant: 'm3', test: 'c1' },
        { mutant: 'm4', test: 'd1' },
      ],
      {
        change: result => ({
          ...result,
          incomplete: [
            { message: 'killed', reason: 'hang', unit: 0 },
            { message: 'killed', reason: 'hang', unit: 1 },
            { message: 'killed', reason: 'hang', unit: 2 },
            { message: 'killed', reason: 'hang', unit: 3 },
          ],
          tries: result.tries.map(facts =>
            facts.mutant === null ?
              { ...facts, ...HUNG_CONTROLS[facts.test] }
            : facts,
          ),
        }),
        mutants: ['m1', 'm2', 'm3', 'm4'],
      },
    )

    expect(state.mutants.get('m1')!.confirm).toStrictEqual([
      { cause: 'hang', test: 't1' },
    ])
    expect(
      state.diagnostics.map(diagnostic => diagnostic.message),
    ).toStrictEqual([
      'The worker running t/a.test.ts stopped responding in "t1" with mutant m1 and was stopped.',
      'The worker running t/b.test.ts stopped responding in "b1" without a mutant and was stopped.',
      'The worker running t/c.test.ts stopped responding and was stopped.',
      'The worker running t/d.test.ts stopped responding in "ghost" without a mutant and was stopped.',
    ])
    expect(state.diagnostics[0]).toMatchObject({
      file: 't/a.test.ts',
      code: 'worker-hang',
      severity: 'warning',
    })
  })

  it('doubts mutants with late errors and returns missing tries', async () => {
    let { missing, state } = await apply(
      {
        tests: [
          {
            covers: ['late', 'gone', 'killed', 'slow'],
            kills: { killed: 'boom' },
            file: '/t/a.test.ts',
            hangs: ['slow'],
            id: 't1',
          },
          { file: '/t/a.test.ts', covers: ['gone'], id: 't2' },
        ],
      },
      [
        { mutant: 'late', test: 't1' },
        { mutant: 'gone', test: 't1' },
        { mutant: 'killed', test: 't1' },
        { mutant: 'slow', test: 't1' },
        { mutant: 'gone', test: 't2' },
        { mutant: 'killed', test: 't2' },
        { mutant: 'slow', test: 't2' },
      ],
      {
        change: result => ({
          ...result,
          late: [
            { message: 'late', mutant: 'late', test: 't1' },
            { mutant: 'killed', message: 'late', test: 't1' },
            { message: 'late', mutant: null, test: 't1' },
          ],
          tries: [
            ...result.tries.filter(facts => facts.mutant !== 'gone'),
            { ...result.tries[1]!, mutant: 'unknown' },
          ],
        }),
        mutants: ['late', 'gone', 'killed', 'slow'],
      },
    )

    expect(state.mutants.get('late')).toMatchObject({
      isolatedBecause: 'doubtful',
      path: 'isolated',
    })
    expect(state.mutants.get('killed')!.verdict?.status).toBe('Killed')
    expect(missing).toStrictEqual([
      { mutant: 'gone', test: 't1' },
      { mutant: 'gone', test: 't2' },
    ])
  })

  it('counts later tries of a decided mutant without changing it', async () => {
    let { state } = await apply(
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
      [
        { mutant: 'm1', test: 'a1' },
        { mutant: 'm1', test: 'b1' },
      ],
      { mutants: ['m1'] },
    )

    expect(state.mutants.get('m1')).toMatchObject({
      verdict: { status: 'Killed', test: 'a1' },
      survived: false,
      tries: 2,
    })
  })

  it('counts the mutants of a test whose leading control skipped as tried', async () => {
    let { missing, state } = await apply(
      { tests: [{ file: '/t/a.test.ts', covers: ['m1', 'm2'], id: 't1' }] },
      [
        { mutant: 'm1', test: 't1' },
        { mutant: 'm2', test: 't1' },
      ],
      {
        change: result => ({
          ...result,
          tries: [{ ...result.tries[0]!, skipped: true }],
        }),
        mutants: ['m1', 'm2'],
      },
    )

    expect(missing).toStrictEqual([])
    expect(state.mutants.get('m1')).toMatchObject({
      survived: false,
      path: 'batch',
      verdict: null,
      tries: 0,
    })
  })
})
