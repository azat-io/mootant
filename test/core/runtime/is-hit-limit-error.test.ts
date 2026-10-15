import { describe, expect, it } from 'vitest'

import { createHitLimitError } from '../../../core/runtime/create-hit-limit-error'
import { isHitLimitError } from '../../../core/runtime/is-hit-limit-error'

describe('isHitLimitError', () => {
  it('accepts the error of the hit limit and copies of it', () => {
    expect(isHitLimitError(createHitLimitError('a', 1))).toBe(true)
    expect(isHitLimitError({ name: 'MootantHitLimitError' })).toBe(true)
  })

  it.each([
    ['another error', new Error('a')],
    ['null', null],
    ['a string', 'MootantHitLimitError'],
  ])('rejects %s', (_description, value) => {
    expect(isHitLimitError(value)).toBe(false)
  })
})
