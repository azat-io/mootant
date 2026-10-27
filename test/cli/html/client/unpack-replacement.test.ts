import { describe, expect, it } from 'vitest'

import { unpackReplacement } from '../../../../cli/html/client/unpack-replacement'

describe('unpackReplacement', () => {
  it('returns a replacement stored whole', () => {
    expect(unpackReplacement('a < b', { replacement: 'a <= b' })).toBe('a <= b')
  })

  it('puts the kept start and end of the original around the stored text', () => {
    expect(
      unpackReplacement('[first, second, third]', {
        replacement: '',
        keep: [7, 7],
      }),
    ).toBe('[first, third]')
  })
})
