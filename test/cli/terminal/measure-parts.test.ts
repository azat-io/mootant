import { describe, expect, it } from 'vitest'

import { measureParts } from '../../../cli/terminal/measure-parts'

describe('measureParts', () => {
  it('adds the reserved room or the text of each part and the separators', () => {
    expect(
      measureParts(
        [
          { text: '\u{1B}[90m123\u{1B}[39m', width: 2, rank: 1 },
          { width: 6, text: '', rank: 2 },
        ],
        ' · ',
      ),
    ).toBe(12)
    expect(measureParts([], ' · ')).toBe(0)
  })
})
