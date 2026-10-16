import { describe, expect, it } from 'vitest'

import { formatLocation } from '../../cli/format-location'

describe('formatLocation', () => {
  it('formats the position of the range', () => {
    expect(formatLocation({ file: 'a.ts', column: 3, line: 2 })).toBe(
      'a.ts:2:3',
    )
  })

  it('prefers the position of the focus', () => {
    expect(
      formatLocation({
        focus: {
          replacement: '',
          original: '^',
          column: 9,
          start: 20,
          line: 4,
          end: 21,
        },
        file: 'a.ts',
        column: 3,
        line: 2,
      }),
    ).toBe('a.ts:4:9')
  })
})
