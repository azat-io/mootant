import { describe, expect, it } from 'vitest'

import { createDryReuseMiss } from '../../../core/cache/create-dry-reuse-miss'
import { isDryReuseMiss } from '../../../core/cache/is-dry-reuse-miss'

describe('isDryReuseMiss', () => {
  it('tells the error of a replay that cannot decide the run from others', () => {
    expect(isDryReuseMiss(createDryReuseMiss('a file changed'))).toBe(true)
    expect(isDryReuseMiss(new Error('boom'))).toBe(false)
    expect(isDryReuseMiss('DryReuseMiss')).toBe(false)
    expect(isDryReuseMiss(null)).toBe(false)
  })
})
