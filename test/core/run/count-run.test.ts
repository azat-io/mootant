import { describe, expect, it } from 'vitest'

import { createTestRun } from '../../helpers/create-test-run'
import { countRun } from '../../../core/run/count-run'

describe('countRun', () => {
  it('counts runs by kind and reports each as it starts', async () => {
    let { state } = await createTestRun({ tests: [] }, { mutants: [] })
    let progress: string[] = []
    state.progress = message => {
      progress.push(message)
    }

    countRun(state, 'batch', { mutants: 3, units: 2 })
    countRun(state, 'batch', { mutants: 1, units: 1 })
    countRun(state, 'isolated', { mutants: 2, units: 5 })

    expect(state.runs).toStrictEqual({ isolated: 1, batch: 2 })
    expect(progress).toStrictEqual([
      'Batch run: 3 mutants in 2 units.',
      'Batch run: 1 mutant in 1 unit.',
      'Isolated run: 2 mutants in 5 units.',
    ])
  })
})
