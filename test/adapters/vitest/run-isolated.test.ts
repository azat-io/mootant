import { describe, expect, it, vi } from 'vitest'

import type { VitestHeartbeat } from '../../../adapters/vitest/types/vitest-worker'

import { readUnitInputs } from '../../../adapters/vitest/read-unit-inputs'
import { runIsolated } from '../../../adapters/vitest/run-isolated'
import { createTryFacts } from '../../helpers/create-try-facts'
import { runPlan } from '../../../adapters/vitest/run-plan'

vi.mock(import('../../../adapters/vitest/run-plan'), () => ({
  runPlan: vi.fn(),
}))

vi.mock(import('../../../adapters/vitest/read-unit-inputs'), () => ({
  readUnitInputs: vi.fn(
    (
      _handle: unknown,
      _unit: unknown,
      reported?: { dependencies: string[] | null; environment: string[] },
    ) =>
      Promise.resolve(
        reported!.dependencies === null ?
          null
        : {
            dependencies: reported!.dependencies,
            environment: reported!.environment,
          },
      ),
  ),
}))

describe('runIsolated', () => {
  it('turns unit records into unit facts', async () => {
    let tries = [
      createTryFacts({ reached: true, duration: 2, test: 'a', hits: 3 }),
      createTryFacts({ duration: 4, test: 'b', hits: 1 }),
    ]
    let records = [
      { kind: 'test' as const, tries: [tries[0]!], name: 'a', line: 1 },
      { kind: 'test' as const, tries: [tries[1]!], name: 'b', line: 2 },
    ]
    vi.mocked(runPlan).mockResolvedValue({
      units: [
        {
          records: [
            ...records,
            {
              dependencies: ['/p/a.test.ts'],
              hookError: 'afterAll boom',
              environment: ['MODE'],
              loadError: 'boom',
              strays: ['stray'],
              concurrent: false,
              abandoned: false,
              loadDuration: 1,
              reached: true,
              booted: 1150,
              modified: [],
              duration: 9,
              kind: 'end',
              covers: [],
              hits: 7,
              unit: 0,
            },
          ],
          claimed: true,
          hung: null,
          pid: 100,
        },
        { claimed: false, records: [], hung: null, pid: null },
        { hung: {} as VitestHeartbeat, claimed: true, pid: 102, records },
        { claimed: true, records: [], hung: null, pid: 103 },
        {
          records: [
            {
              hookError: 'Hook timed out in 519ms.',
              concurrent: false,
              abandoned: false,
              dependencies: [],
              loadError: null,
              loadDuration: 1,
              environment: [],
              reached: true,
              duration: 600,
              booted: 2500,
              modified: [],
              kind: 'end',
              strays: [],
              covers: [],
              hits: 1,
              unit: 4,
            },
          ],
          claimed: true,
          hung: null,
          pid: 104,
        },
      ],
      error: null,
    })

    let plan = { units: [] }
    let handle = { state: { spawns: new Map([[100, 1000]]) } } as never

    await expect(runIsolated(handle, plan)).resolves.toStrictEqual({
      units: [
        {
          inputs: { dependencies: ['/p/a.test.ts'], environment: ['MODE'] },
          hookError: 'afterAll boom',
          loadError: 'boom',
          strays: ['stray'],
          incomplete: null,
          timedOut: false,
          reached: true,
          tests: tries,
          startup: 150,
          duration: 9,
          hits: 7,
          unit: 0,
        },
        {
          incomplete: 'hang',
          timedOut: false,
          hookError: null,
          loadError: null,
          reached: true,
          tests: tries,
          duration: 6,
          strays: [],
          hits: 4,
          unit: 2,
        },
        {
          incomplete: 'crash',
          timedOut: false,
          hookError: null,
          loadError: null,
          reached: false,
          duration: 0,
          strays: [],
          tests: [],
          hits: 0,
          unit: 3,
        },
        {
          inputs: { dependencies: [], environment: [] },
          hookError: 'Hook timed out in 519ms.',
          incomplete: null,
          loadError: null,
          timedOut: true,
          reached: true,
          duration: 600,
          startup: 0,
          strays: [],
          tests: [],
          hits: 1,
          unit: 4,
        },
      ],
    })
    expect(readUnitInputs).toHaveBeenCalledTimes(2)

    let [[, { describe: describeUnit }]] = vi.mocked(runPlan).mock.calls as [
      Parameters<typeof runPlan>,
    ]

    expect(describeUnit!(2, { hung: null, pid: 102, records })).toStrictEqual({
      incomplete: 'crash',
      timedOut: false,
      hookError: null,
      loadError: null,
      reached: true,
      tests: tries,
      duration: 6,
      strays: [],
      hits: 4,
      unit: 2,
    })
  })
})
