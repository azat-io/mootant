import { describe, expect, it } from 'vitest'

import { computeStaticCost } from '../../../core/run/compute-static-cost'
import { createTestRun } from '../../helpers/create-test-run'

describe('computeStaticCost', () => {
  it('sums isolated units per source file, most expensive first', async () => {
    let { state } = await createTestRun(
      {
        tests: [{ file: '/t/a.test.ts', covers: ['m2', 'm3'], id: 'a1' }],
        files: [{ loadCovers: ['m1', 'm4'], file: '/t/a.test.ts' }],
      },
      { mutants: ['m1', 'm2', 'm3', 'm4', 'm5', 'm6'], isolate: true },
    )
    for (let [id, file, units, unitDuration] of [
      ['m1', 'src/a.ts', 2, 10],
      ['m2', 'src/a.ts', 1, 5],
      ['m3', 'src/b.ts', 1, 30],
      ['m4', 'src/c.ts', 0, 0],
      ['m5', 'src/d.ts', 0, 0],
      ['m6', 'src/0.ts', 1, 30],
    ] as const) {
      let mutant = state.mutants.get(id)!
      mutant.mutant = { ...mutant.mutant, file }
      Object.assign(mutant, { unitDuration, units })
    }

    expect(computeStaticCost(state)).toStrictEqual([
      { file: 'src/0.ts', duration: 30, mutants: 0, units: 1 },
      { file: 'src/b.ts', duration: 30, mutants: 0, units: 1 },
      { file: 'src/a.ts', duration: 15, mutants: 1, units: 3 },
      { file: 'src/c.ts', duration: 0, mutants: 1, units: 0 },
    ])
  })
})
