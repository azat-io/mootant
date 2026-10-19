import { describe, expect, it } from 'vitest'

import { fitParts } from '../../../cli/terminal/fit-parts'

describe('fitParts', () => {
  it('leaves out the parts of the highest ranks until the rest fits', () => {
    let parts = [
      { text: 'one', rank: 1 },
      { text: '\u{1B}[90m3\u{1B}[39m', rank: 3 },
      { text: 'two', rank: 2 },
      { text: 'four', rank: 4 },
    ]

    expect(fitParts(parts, ' · ', 100)).toBe(
      'one · \u{1B}[90m3\u{1B}[39m · two · four',
    )
    expect(fitParts(parts, ' · ', 15)).toBe('one · \u{1B}[90m3\u{1B}[39m · two')
    expect(fitParts(parts, ' · ', 12)).toBe('one · two')
    expect(fitParts(parts, ' · ', 3)).toBe('one')
    expect(fitParts(parts, ' · ', 2)).toBe('')
  })

  it('measures parts by their reserved room and shows only those with a text', () => {
    let parts = [
      { text: '1/9', width: 5, rank: 1 },
      { width: 6, text: '', rank: 2 },
      { text: 'late', rank: 3 },
    ]

    expect(fitParts(parts, ' ', 17)).toBe('1/9 late')
    expect(fitParts(parts, ' ', 16)).toBe('1/9')
    expect(fitParts(parts, ' ', 11)).toBe('1/9')
    expect(fitParts(parts, ' ', 10)).toBe('1/9')
    expect(fitParts(parts, ' ', 4)).toBe('')
  })
})
