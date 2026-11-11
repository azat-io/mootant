import { describe, expect, it } from 'vitest'

import { ENVIRONMENT_SLOT } from '../../../adapters/shared/environment-slot'

describe('eNVIRONMENT_SLOT', () => {
  it('is the registered symbol every copy of the module finds on the global', () => {
    expect(ENVIRONMENT_SLOT).toBe(Symbol.for('mootant.environment'))
  })
})
