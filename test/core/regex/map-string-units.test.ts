import { describe, expect, it } from 'vitest'

import { mapStringUnits } from '../../../core/regex/map-string-units'

/**
 * Reads the whole text as the inside of a literal.
 *
 * @param text - Source text between the quotes.
 * @param isTemplate - Whether the text belongs to a template.
 * @returns Value and offsets.
 */
function read(
  text: string,
  isTemplate = false,
): ReturnType<typeof mapStringUnits> {
  return mapStringUnits(
    `'${text}'`,
    { end: text.length + 1, start: 1 },
    isTemplate,
  )
}

describe('mapStringUnits', () => {
  it('reads plain characters', () => {
    expect(read('ab')).toStrictEqual({ offsets: [1, 2, 3], value: 'ab' })
  })

  it.each([
    [String.raw`\\`, '\\'],
    [String.raw`\'`, "'"],
    [String.raw`\n`, '\n'],
    [String.raw`\b\f\r\t\v`, '\b\f\r\t\v'],
    [String.raw`\x41`, 'A'],
    [String.raw`\u{41}`, 'A'],
    [`${String.raw`\u`}0041`, 'A'],
    [String.raw`\u{1F600}`, '😀'],
    [String.raw`\0`, '\0'],
    [String.raw`\101`, 'A'],
    [String.raw`\477`, "'7"],
    [String.raw`\8`, '8'],
    [String.raw`\d`, 'd'],
    [String.raw`\😀`, '😀'],
    ['😀', '😀'],
  ])('reads %s as %o', (text, value) => {
    expect(read(text).value).toBe(value)
  })

  it('gives the units of an escape the offset where it starts', () => {
    expect(read(String.raw`a\u{1F600}\\b`).offsets).toStrictEqual([
      1, 2, 2, 11, 13, 14,
    ])
  })

  it.each(['\\\n', '\\\r\n', '\\\r', '\\\u{2028}', '\\\u{2029}'])(
    'skips the line continuation %o',
    continuation => {
      expect(read(`a${continuation}b`).value).toBe('ab')
    },
  )

  it('reads a carriage return of a template as a line feed', () => {
    expect(read('a\r\nb\rc', true)).toStrictEqual({
      offsets: [1, 2, 4, 5, 6, 7],
      value: 'a\nb\nc',
    })
  })

  it('keeps a carriage return of a string', () => {
    expect(read('a\rb').value).toBe('a\rb')
  })
})
