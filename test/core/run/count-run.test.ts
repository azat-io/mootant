import { describe, expect, it } from 'vitest'

import type { RunEvent } from '../../../types/run/run-event'

import { createTestRun } from '../../helpers/create-test-run'
import { countRun } from '../../../core/run/count-run'

describe('countRun', () => {
  it('counts runs by kind and reports each as it starts with its round', async () => {
    let { state } = await createTestRun({ tests: [] }, { mutants: [] })
    let events: RunEvent[] = []
    state.report = event => {
      events.push(event)
    }
    let work = { chains: [0, 1], costs: [5, 7], workers: 2 }

    countRun(state, 'batch', { ...work, mutants: 3 })
    countRun(state, 'batch', { ...work, mutants: 1 })
    countRun(state, 'isolated', { ...work, mutants: 2 })

    expect(state.runs).toStrictEqual({ isolated: 1, batch: 2 })
    expect(events).toStrictEqual([
      { kind: 'verdicts', survived: 0, timeout: 0, killed: 0, error: 0 },
      {
        ...work,
        kind: 'run-start',
        run: 'batch',
        mutants: 3,
        round: 1,
        units: 2,
      },
      {
        ...work,
        kind: 'run-start',
        run: 'batch',
        mutants: 1,
        round: 2,
        units: 2,
      },
      {
        ...work,
        kind: 'run-start',
        run: 'isolated',
        mutants: 2,
        round: 1,
        units: 2,
      },
    ])
  })
})
