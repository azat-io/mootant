import { describe, expect, it } from 'vitest'

import { getBatchUnitCost } from '../../../core/run/get-batch-unit-cost'
import { createTestRun } from '../../helpers/create-test-run'
import { planBatch } from '../../../core/run/plan-batch'

describe('getBatchUnitCost', () => {
  it('adds loading, the tries and controls of planned tests and the tests between', async () => {
    let file = '/t/a.test.ts'
    let { state } = await createTestRun(
      {
        tests: [
          { covers: ['m1'], duration: 2, id: 'a1', file },
          { duration: 3, id: 'a2', file },
          { covers: ['m2'], duration: 5, id: 'a3', file },
          { duration: 7, id: 'a4', file },
        ],
        files: [{ loadDuration: 4, file }],
      },
      { mutants: ['m1', 'm2'] },
    )
    let tries = [
      { mutant: 'm1', test: 'a1' },
      { mutant: 'm2', test: 'a3' },
    ]
    let plain = planBatch(state, tries, 1).units[0]!
    let confirming = planBatch(state, tries, 2).units[0]!

    expect(getBatchUnitCost(state, plain, 1)).toBe(4 + 2 * 3 + 3 + 5 * 3)
    expect(getBatchUnitCost(state, confirming, 2)).toBe(confirming.limits.total)

    state.analysis.loads.delete(file)

    expect(getBatchUnitCost(state, plain, 1)).toBe(2 * 3 + 3 + 5 * 3)
  })
})
