import { describe, expect, it } from 'vitest'

import { createHitLimitError } from '../../../core/runtime/create-hit-limit-error'

describe('createHitLimitError', () => {
  it('names the error and tells the limit and the mutant', () => {
    let error = createHitLimitError('abc123', 100)

    expect(error.name).toBe('MootantHitLimitError')
    expect(error.message).toBe(
      'mootant stopped the test after 100 evaluations of mutant sites, at mutant abc123; the code is likely stuck in a loop.',
    )
  })
})
