import { describe, expect, it } from 'vitest'

import { encodePatternText } from '../../../core/regex/encode-pattern-text'

describe('encodePatternText', () => {
  it.each(['literal', 'raw', 'string', 'template'] as const)(
    'keeps plain text in the %s form',
    form => {
      expect(encodePatternText('a+[^]', form, "'")).toBe('a+[^]')
    },
  )

  it.each<[string, string, string]>([
    [String.raw`\d`, "'", String.raw`\\d`],
    ['a\'b"', "'", String.raw`a\'b"`],
    ['a\'b"', '"', String.raw`a'b\"`],
    ['\n\r\u{2028}\u{2029}', "'", String.raw`\n\r\u2028\u2029`],
    ['$`', "'", '$`'],
    ['\u{0}1', "'", String.raw`\x001`],
  ])('writes %o in a string quoted with %s as %o', (text, quote, expected) => {
    expect(encodePatternText(text, 'string', quote)).toBe(expected)
  })

  it.each([
    [String.raw`\d`, String.raw`\\d`],
    ['`', '\\`'],
    [`\${a}`, `\\\${a}`],
    ['$a', '$a'],
    ['\'"\n', '\'"\n'],
    ['\r', String.raw`\r`],
    ['\u{0}1', String.raw`\x001`],
  ])('writes %o in a template as %o', (text, expected) => {
    expect(encodePatternText(text, 'template', '`')).toBe(expected)
  })

  it.each(['literal', 'raw'] as const)(
    'keeps backslashes and quotes in the %s form',
    form => {
      expect(encodePatternText(String.raw`\d'"\``, form, '/')).toBe(
        String.raw`\d'"\``,
      )
    },
  )

  it.each(['literal', 'raw', 'string', 'template'] as const)(
    'escapes a lone surrogate and keeps a pair in the %s form',
    form => {
      expect(encodePatternText('\u{D83D}😀\u{DE00}', form, "'")).toBe(
        `${String.raw`\uD83D`}😀${String.raw`\uDE00`}`,
      )
    },
  )

  it.each(['literal', 'raw'] as const)(
    'replaces an identity escape of a lone surrogate in the %s form',
    form => {
      expect(encodePatternText('\\\u{D83D}a\\\\\u{DE00}', form, '/')).toBe(
        String.raw`\uD83Da\\\uDE00`,
      )
    },
  )

  it.each(['string', 'template'] as const)(
    'keeps the backslash before a lone surrogate in the %s form',
    form => {
      expect(encodePatternText('\\\u{D83D}', form, "'")).toBe(
        String.raw`\\\uD83D`,
      )
    },
  )
})
