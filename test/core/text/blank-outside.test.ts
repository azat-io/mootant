import { describe, expect, it } from 'vitest'

import { blankOutside } from '../../../core/text/blank-outside'

/**
 * Byte order mark that may start a file.
 */
const BYTE_ORDER_MARK = String.fromCodePoint(0xfe_ff)

describe('blankOutside', () => {
  it('keeps the ranges and the line terminators', () => {
    expect(
      blankOutside('ab {c}\r\nd {e}\u{2028}f', [
        { start: 4, end: 5 },
        { start: 11, end: 12 },
      ]),
    ).toBe('    c \r\n   e \u{2028} ')
  })

  it('keeps a leading byte order mark', () => {
    expect(blankOutside(`${BYTE_ORDER_MARK}ab`, [{ start: 2, end: 3 }])).toBe(
      `${BYTE_ORDER_MARK} b`,
    )
  })

  it('blanks the whole text without ranges', () => {
    expect(blankOutside('a\nb', [])).toBe(' \n ')
  })
})
