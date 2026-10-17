import { describe, expect, it } from 'vitest'

import { INSTRUMENTER_VERSION } from '../../../core/instrument/instrumenter-version'

describe('instrumenter version', () => {
  it('is a positive integer', () => {
    expect(INSTRUMENTER_VERSION).toBe(1)
  })
})
