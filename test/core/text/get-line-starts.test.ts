import { describe, expect, it } from 'vitest'

import { getLineStarts } from '../../../core/text/get-line-starts'

/**
 * Byte order mark that may start a file.
 */
const BYTE_ORDER_MARK = String.fromCodePoint(0xfe_ff)

describe('getLineStarts', () => {
  it.each([
    ['an empty text', '', [0]],
    ['a single line', 'let a = 1', [0]],
    ['LF', 'a\nb\nc', [0, 2, 4]],
    ['CR', 'a\rb\rc', [0, 2, 4]],
    ['CRLF', 'a\r\nb\r\nc', [0, 3, 6]],
    ['U+2028', 'a\u{2028}b', [0, 2]],
    ['U+2029', 'a\u{2029}b', [0, 2]],
    ['mixed terminators', 'a\r\n\rb\n\u{2028}', [0, 3, 4, 6, 7]],
    ['a trailing terminator', 'a\n', [0, 2]],
    ['LF followed by CR', 'a\n\rb', [0, 2, 3]],
  ])('returns the line starts of %s', (_description, text, expected) => {
    expect(getLineStarts(text)).toStrictEqual(expected)
  })

  it.each([
    ['a byte order mark', `${BYTE_ORDER_MARK}a\nb`, [1, 3]],
    ['only a byte order mark', BYTE_ORDER_MARK, [1]],
  ])('starts the first line after %s', (_description, text, expected) => {
    expect(getLineStarts(text)).toStrictEqual(expected)
  })

  it('keeps a byte order mark that does not start the text', () => {
    expect(getLineStarts(`a${BYTE_ORDER_MARK}\nb`)).toStrictEqual([0, 3])
  })
})
