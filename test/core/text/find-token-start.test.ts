import { describe, expect, it } from 'vitest'

import { findTokenStart } from '../../../core/text/find-token-start'
import { createTestFile } from '../../helpers/create-test-file'

/**
 * Byte order mark that may start a file.
 */
const BYTE_ORDER_MARK = String.fromCodePoint(0xfe_ff)

describe('findTokenStart', () => {
  it.each([
    ['a tab', '\t'],
    ['a vertical tab', '\v'],
    ['a form feed', '\f'],
    ['a space', ' '],
    ['a no-break space', '\u{A0}'],
    ['a byte order mark', BYTE_ORDER_MARK],
    ['an Ogham space mark', '\u{1680}'],
    ['an en quad', '\u{2000}'],
    ['a hair space', '\u{200A}'],
    ['a narrow no-break space', '\u{202F}'],
    ['a medium mathematical space', '\u{205F}'],
    ['an ideographic space', '\u{3000}'],
    ['a line feed', '\n'],
    ['a carriage return', '\r'],
    ['a line separator', '\u{2028}'],
    ['a paragraph separator', '\u{2029}'],
  ])('skips %s', (_description, space) => {
    let { parsed } = createTestFile(`a${space}+ b`, 'example.js')

    expect(findTokenStart(parsed, 1, parsed.text.length)).toBe(2)
  })

  it.each([
    ['a block comment', 'a /* + */ - b', 10],
    ['consecutive comments', 'a /* + *//* - */* b', 16],
    ['a line comment', ['a // +', '- b'].join('\n'), 7],
    ['a comment right at the start', 'a/* + */-b', 8],
  ])('skips %s', (_description, source, expected) => {
    let { parsed } = createTestFile(source, 'example.js')

    expect(findTokenStart(parsed, 1, parsed.text.length)).toBe(expected)
  })

  it('skips parentheses', () => {
    let { parsed } = createTestFile('((a)) += 1', 'example.js')

    expect(findTokenStart(parsed, 3, parsed.text.length)).toBe(6)
  })

  it('returns the start offset when it is a token', () => {
    let { parsed } = createTestFile('a + b', 'example.js')

    expect(findTokenStart(parsed, 2, 5)).toBe(2)
  })

  it.each([
    { description: 'only white space', source: 'a  + b', start: 1, end: 3 },
    {
      description: 'only a comment',
      source: 'a /* c */ + b',
      start: 1,
      end: 10,
    },
    { description: 'nothing', source: 'a + b', start: 2, end: 2 },
  ])('returns -1 for a range with $description', ({ source, start, end }) => {
    expect(
      findTokenStart(createTestFile(source, 'example.js').parsed, start, end),
    ).toBe(-1)
  })

  it('does not look past the end of the range', () => {
    let { parsed } = createTestFile('a /* c */ + b', 'example.js')

    expect(findTokenStart(parsed, 1, 5)).toBe(-1)
  })
})
