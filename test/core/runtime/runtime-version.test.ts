import { describe, expect, it } from 'vitest'

import { RUNTIME_VERSION } from '../../../core/runtime/runtime-version'

describe('RUNTIME_VERSION', () => {
  it('is a positive integer', () => {
    expect(RUNTIME_VERSION).toBe(2)
  })
})
