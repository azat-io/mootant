import { describe, expect, it } from 'vitest'

import { VITEST_VARIABLES } from '../../../../adapters/vitest/worker/vitest-variables'

describe('vITEST_VARIABLES', () => {
  it('names the variables Vitest numbers its workers with', () => {
    expect(VITEST_VARIABLES).toStrictEqual([
      'VITEST_WORKER_ID',
      'VITEST_POOL_ID',
    ])
  })
})
