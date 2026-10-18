import { describe, expect, it } from 'vitest'

import { getErrorMessage } from '../../../adapters/shared/get-error-message'

describe('getErrorMessage', () => {
  it('keeps the first line of the message, at most 200 code units', () => {
    expect(getErrorMessage(new Error('first\nsecond'))).toBe('first')
    expect(getErrorMessage(new Error('x'.repeat(300)))).toHaveLength(200)
  })

  it('reads errors without a prototype and values that are not errors', () => {
    let serialized = Object.assign(Object.create(null) as object, {
      message: 'serialized',
    })

    expect(getErrorMessage(serialized)).toBe('serialized')
    expect(
      getErrorMessage(Object.assign(new TypeError('x'), { message: '' })),
    ).toBe('TypeError')
    expect(getErrorMessage({ name: '' })).toBe('Error')
    expect(getErrorMessage('plain')).toBe('plain')
    expect(getErrorMessage(null)).toBe('null')
  })
})
