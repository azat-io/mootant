import { describe, expect, it } from 'vitest'

import { getSourcePosition } from '../../../core/text/get-source-position'
import { getLineStarts } from '../../../core/text/get-line-starts'

/**
 * Byte order mark that may start a file.
 */
const BYTE_ORDER_MARK = String.fromCodePoint(0xfe_ff)

describe('getSourcePosition', () => {
  it.each([
    [0, 1, 1],
    [3, 1, 4],
    [4, 2, 1],
    [6, 2, 3],
    [7, 3, 1],
    [8, 4, 1],
    [9, 4, 2],
  ])('maps offset %i to line %i, column %i', (offset, line, column) => {
    let lineStarts = getLineStarts(['let', 'ab', '', 'c'].join('\n'))

    expect(getSourcePosition(lineStarts, offset)).toStrictEqual({
      column,
      line,
    })
  })

  it.each([
    [0, 1, 1],
    [3, 1, 4],
    [4, 2, 1],
    [6, 3, 1],
    [7, 3, 2],
  ])(
    'maps offset %i to line %i, column %i across CRLF and U+2028',
    (offset, line, column) => {
      let lineStarts = getLineStarts('ab\r\nc\u{2028}de')

      expect(getSourcePosition(lineStarts, offset)).toStrictEqual({
        column,
        line,
      })
    },
  )

  it('counts an astral character as two columns', () => {
    let lineStarts = getLineStarts('\u{1F600}x\ny')

    expect(getSourcePosition(lineStarts, 2)).toStrictEqual({
      column: 3,
      line: 1,
    })
  })

  it.each([
    [0, 1, 1],
    [1, 1, 1],
    [2, 1, 2],
    [4, 2, 1],
  ])(
    'does not count a byte order mark at offset %i',
    (offset, line, column) => {
      let lineStarts = getLineStarts(`${BYTE_ORDER_MARK}ab\nc`)

      expect(getSourcePosition(lineStarts, offset)).toStrictEqual({
        column,
        line,
      })
    },
  )

  it('maps the end of the text after a trailing terminator', () => {
    let lineStarts = getLineStarts('a\n')

    expect(getSourcePosition(lineStarts, 2)).toStrictEqual({
      column: 1,
      line: 2,
    })
  })

  it('maps offsets of an empty text to the first line', () => {
    expect(getSourcePosition(getLineStarts(''), 0)).toStrictEqual({
      column: 1,
      line: 1,
    })
  })
})
