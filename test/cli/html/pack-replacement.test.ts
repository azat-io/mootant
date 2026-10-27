import { describe, expect, it } from 'vitest'

import { unpackReplacement } from '../../../cli/html/client/unpack-replacement'
import { packReplacement } from '../../../cli/html/pack-replacement'

describe('packReplacement', () => {
  it('keeps a short replacement as it is', () => {
    expect(packReplacement('a < b', 'a <= b')).toStrictEqual({
      replacement: 'a <= b',
    })
  })

  it('stores the long start and end the replacement shares by their lengths', () => {
    let original = `{ first: ${'1'.repeat(30)}, drop: 2, last: ${'3'.repeat(30)} }`
    let replacement = `{ first: ${'1'.repeat(30)}, last: ${'3'.repeat(30)} }`
    let packed = packReplacement(original, replacement)

    expect(packed).toStrictEqual({ replacement: '', keep: [41, 38] })
    expect(unpackReplacement(original, packed)).toBe(replacement)
  })

  it('never lets the kept start and end overlap', () => {
    let original = 'a'.repeat(40)
    let replacement = 'a'.repeat(36)
    let packed = packReplacement(original, replacement)

    expect(packed).toStrictEqual({ replacement: '', keep: [36, 0] })
    expect(unpackReplacement(original, packed)).toBe(replacement)
  })
})
