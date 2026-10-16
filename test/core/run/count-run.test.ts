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

    countRun(state, 'batch', { mutants: 3, units: 2 })
    countRun(state, 'batch', { mutants: 1, units: 1 })
    countRun(state, 'isolated', { mutants: 2, units: 5 })

    expect(state.runs).toStrictEqual({ isolated: 1, batch: 2 })
    expect(events).toStrictEqual([
      { kind: 'run-start', run: 'batch', mutants: 3, round: 1, units: 2 },
      { kind: 'run-start', run: 'batch', mutants: 1, round: 2, units: 1 },
      { kind: 'run-start', run: 'isolated', mutants: 2, round: 1, units: 5 },
    ])
  })
})
