import { describe, expect, it } from 'vitest'

import type { RunEvent } from '../../../types/run/run-event'

import { previewIsolatedUnit } from '../../../core/run/preview-isolated-unit'
import { runIsolatedRounds } from '../../../core/run/run-isolated-rounds'
import { createTestRun } from '../../helpers/create-test-run'

describe('previewIsolatedUnit', () => {
  it('counts the verdicts of isolated units as they end', async () => {
    let { session, state, fake } = await createTestRun(
      {
        tests: [
          { covers: ['kept', 'killed'], file: '/t/a.test.ts', id: 'a1' },
          {
            kills: { late: 'late boom', killed: 'boom' },
            covers: ['kept', 'killed', 'late'],
            file: '/t/b.test.ts',
            id: 'b1',
          },
          { file: '/t/c.test.ts', covers: ['late'], id: 'c1' },
        ],
      },
      { mutants: ['kept', 'killed', 'late'], isolate: true },
    )
    let events: (RunEvent | string)[] = []
    state.report = event => {
      events.push(event.kind === 'run-start' ? `run ${event.round}` : event)
    }
    fake.context!.onUnitEnd = end => {
      events.push(`end ${end!.unit}`)
      previewIsolatedUnit(state, end!)
    }

    await runIsolatedRounds(session, state)

    expect(events).toStrictEqual([
      { kind: 'verdicts', survived: 0, timeout: 0, killed: 0, error: 0 },
      'run 1',
      'end 0',
      'end 1',
      'end 2',
      { kind: 'verdicts', survived: 0, timeout: 0, killed: 1, error: 0 },
      'run 2',
      'end 0',
      { kind: 'verdicts', survived: 1, timeout: 0, killed: 1, error: 0 },
      'end 1',
      { kind: 'verdicts', survived: 1, timeout: 0, killed: 2, error: 0 },
    ])
    expect(state.live!.running).toBeNull()
    expect(state.live!.preview.size).toBe(0)
  })

  it('counts nothing without facts or a running isolated run', async () => {
    let { state } = await createTestRun(
      { tests: [{ file: '/t/a.test.ts', covers: ['m'], id: 'a1' }] },
      { mutants: ['m'], isolate: true },
    )
    let events: RunEvent[] = []
    state.report = event => {
      events.push(event)
    }
    let facts = {
      incomplete: null,
      hookError: null,
      loadError: null,
      timedOut: false,
      reached: true,
      duration: 1,
      strays: [],
      tests: [],
      hits: 1,
      unit: 0,
    }

    previewIsolatedUnit(state, { unit: 0, facts })
    state.live!.running = {
      requests: [
        {
          file: '/t/a.test.ts',
          confirming: false,
          retried: false,
          mutant: 'm',
        },
      ],
      plan: { units: [] },
    }
    previewIsolatedUnit(state, { unit: 0 })

    expect(events).toStrictEqual([])
  })
})
