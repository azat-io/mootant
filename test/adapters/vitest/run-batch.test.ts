import { describe, expect, it, vi } from 'vitest'

import type { VitestHandle } from '../../../adapters/vitest/types/vitest-session-state'
import type { VitestHeartbeat } from '../../../adapters/vitest/types/vitest-worker'

import { createTryFacts } from '../../helpers/create-try-facts'
import { runBatch } from '../../../adapters/vitest/run-batch'
import { runPlan } from '../../../adapters/vitest/run-plan'

vi.mock(import('../../../adapters/vitest/run-plan'), () => ({
  runPlan: vi.fn(),
}))

let end = {
  kind: 'end' as const,
  concurrent: false,
  abandoned: false,
  loadDuration: 1,
  hookError: null,
  loadError: null,
  reached: false,
  duration: 2,
  covers: [],
  strays: [],
  hits: 0,
  unit: 0,
}

/**
 * Builds the beat of a hung worker.
 *
 * @param mutant - Active mutant, or null.
 * @param test - Running test, or null.
 * @returns Heartbeat.
 */
function createBeat(
  mutant: string | null,
  test: string | null,
): VitestHeartbeat {
  return {
    file: '/a.ts',
    sequence: 2,
    budget: 900,
    name: test,
    unit: 0,
    pid: 1,
    mutant,
    test,
  }
}

describe('runBatch', () => {
  it('turns unit records into tries, late errors, hook errors and incomplete units', async () => {
    let tries = [
      createTryFacts({ test: 't' }),
      createTryFacts({ mutant: 'm', test: 't' }),
    ]
    vi.mocked(runPlan).mockResolvedValue({
      units: [
        {
          records: [
            { kind: 'test', name: 't', line: 1, tries },
            { message: 'late', kind: 'late', mutant: 'm', test: 't' },
            end,
          ],
          claimed: true,
          hung: null,
        },
        { hung: createBeat('m', 't'), claimed: true, records: [] },
        { hung: createBeat(null, null), claimed: true, records: [] },
        { hung: createBeat('m', null), claimed: true, records: [] },
        { claimed: false, records: [], hung: null },
        { records: [{ ...end, abandoned: true }], claimed: true, hung: null },
        { hung: createBeat('m', 't'), records: [end], claimed: true },
        {
          records: [{ ...end, hookError: 'afterAll boom' }],
          claimed: true,
          hung: null,
        },
      ],
      error: null,
    })
    let plan = { concurrency: 2, units: [] } as never
    let result = await runBatch({} as VitestHandle, plan)

    expect(runPlan).toHaveBeenCalledWith(
      {},
      { concurrency: 2, mode: 'batch', units: [] },
    )
    expect(result.tries).toStrictEqual([
      { ...tries[0], unit: 0 },
      { ...tries[1], unit: 0 },
      {
        message: 'The worker stopped responding during this try.',
        timedOut: true,
        skipped: false,
        reached: true,
        failed: false,
        duration: 900,
        covers: null,
        mutant: 'm',
        strays: [],
        test: 't',
        hits: 0,
        unit: 1,
      },
    ])
    expect(result.late).toStrictEqual([
      { message: 'late', mutant: 'm', test: 't' },
    ])
    expect(result.hookErrors).toStrictEqual([
      { message: 'afterAll boom', unit: 7 },
    ])
    expect(
      result.incomplete.map(entry => [entry.unit, entry.reason]),
    ).toStrictEqual([
      [1, 'hang'],
      [2, 'hang'],
      [3, 'hang'],
      [4, 'crash'],
      [5, 'abandoned'],
    ])
    expect(result.incomplete[3]!.message).toBe(
      'The worker stopped without reporting.',
    )
  })

  it('names the run error of a crashed unit', async () => {
    vi.mocked(runPlan).mockResolvedValue({
      units: [{ claimed: true, records: [], hung: null }],
      error: 'Worker forks emitted error.',
    })

    expect(
      (await runBatch({} as VitestHandle, { units: [] })).incomplete,
    ).toStrictEqual([
      { message: 'Worker forks emitted error.', reason: 'crash', unit: 0 },
    ])
  })
})
