import { describe, expect, it } from 'vitest'

import { mapPatternOffsets } from '../../../core/regex/map-pattern-offsets'

describe('mapPatternOffsets', () => {
  it('gives every unit its own offset and the end at the end', () => {
    expect(mapPatternOffsets(String.raw`a\d`, 10)).toStrictEqual([
      10, 11, 12, 13,
    ])
  })

  it('gives both units of a surrogate pair the offset of the first', () => {
    expect(mapPatternOffsets('a😀b', 0)).toStrictEqual([0, 1, 1, 3, 4])
  })

  it('keeps the offset of a lone low surrogate', () => {
    expect(mapPatternOffsets('\u{DE00}a', 0)).toStrictEqual([0, 1, 2])
  })
})
