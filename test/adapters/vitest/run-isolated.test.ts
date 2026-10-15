import { describe, expect, it, vi } from 'vitest'

import type { VitestHandle } from '../../../adapters/vitest/types/vitest-session-state'
import type { VitestHeartbeat } from '../../../adapters/vitest/types/vitest-worker'

import { runIsolated } from '../../../adapters/vitest/run-isolated'
import { createTryFacts } from '../../helpers/create-try-facts'
import { runPlan } from '../../../adapters/vitest/run-plan'

vi.mock(import('../../../adapters/vitest/run-plan'), () => ({
  runPlan: vi.fn(),
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
              hookError: 'afterAll boom',
              loadError: 'boom',
              strays: ['stray'],
              concurrent: false,
              abandoned: false,
              loadDuration: 1,
              reached: true,
              duration: 9,
              kind: 'end',
              covers: [],
              hits: 7,
              unit: 0,
            },
          ],
          claimed: true,
          hung: null,
        },
        { claimed: false, records: [], hung: null },
        { hung: {} as VitestHeartbeat, claimed: true, records },
        { claimed: true, records: [], hung: null },
        {
          records: [
            {
              hookError: 'Hook timed out in 519ms.',
              concurrent: false,
              abandoned: false,
              loadError: null,
              loadDuration: 1,
              reached: true,
              duration: 600,
              kind: 'end',
              strays: [],
              covers: [],
              hits: 1,
              unit: 4,
            },
          ],
          claimed: true,
          hung: null,
        },
      ],
      error: null,
    })

    await expect(
      runIsolated({} as VitestHandle, { units: [] }),
    ).resolves.toStrictEqual({
      units: [
        {
          hookError: 'afterAll boom',
          loadError: 'boom',
          strays: ['stray'],
          incomplete: null,
          timedOut: false,
          reached: true,
          tests: tries,
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
          hookError: 'Hook timed out in 519ms.',
          incomplete: null,
          loadError: null,
          timedOut: true,
          reached: true,
          duration: 600,
          strays: [],
          tests: [],
          hits: 1,
          unit: 4,
        },
      ],
    })
  })
})
