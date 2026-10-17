import { describe, expect, it } from 'vitest'

import { createDigest } from '../../../core/cache/create-digest'

describe('createDigest', () => {
  it('hashes the JSON text of a value', () => {
    expect(createDigest(['a', 1])).toMatch(/^[\da-f]{64}$/u)
    expect(createDigest(['a', 1])).toBe(createDigest(['a', 1]))
    expect(createDigest(['a', 1])).not.toBe(createDigest(['a', 2]))
  })
})
