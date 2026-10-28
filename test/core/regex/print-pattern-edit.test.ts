import { describe, expect, it } from 'vitest'

import type { TextEdit } from '../../../types/source/text-edit'

import { printPatternEdit } from '../../../core/regex/print-pattern-edit'
import { readTestRegex } from '../../helpers/read-test-regex'

/**
 * Prints an edit and leaves out the focus offsets.
 *
 * @param expression - Text of the literal or the call.
 * @param change - Edit relative to the pattern.
 * @returns New text of the node and text of the focus.
 */
function print(expression: string, change: TextEdit): [string, string] {
  let { focus, text } = printPatternEdit(readTestRegex(expression), change)
  return [text, focus.text]
}

describe('printPatternEdit', () => {
  it('splices a literal and focuses the edit', () => {
    expect(
      printPatternEdit(readTestRegex('/a+b/g'), {
        text: '*',
        start: 1,
        end: 2,
      }),
    ).toStrictEqual({
      focus: { text: '*', start: 6, end: 7 },
      text: '/a*b/g',
    })
  })

  it('prints a literal whose pattern becomes empty with a group', () => {
    expect(print('/a/g', { start: 0, text: '', end: 1 })).toStrictEqual([
      '/(?:)/g',
      '',
    ])
  })

  it('writes the rest of a split surrogate pair as an escape', () => {
    expect(print('/[😀a]/', { start: 2, text: '', end: 3 })).toStrictEqual([
      String.raw`/[\uD83Da]/`,
      String.raw`\uD83D`,
    ])
  })

  it.each<[string, TextEdit, [string, string]]>([
    [
      String.raw`/[\😀a]/`,
      { start: 3, text: '', end: 4 },
      [String.raw`/[\uD83Da]/`, String.raw`\uD83D`],
    ],
    [
      'RegExp(String.raw`[\\😀a]`)',
      { start: 3, text: '', end: 4 },
      ['String.raw`[\\uD83Da]`', String.raw`\uD83D`],
    ],
    [
      String.raw`/[\\😀a]/`,
      { start: 4, text: '', end: 5 },
      [String.raw`/[\\\uD83Da]/`, String.raw`\uD83D`],
    ],
  ])(
    'writes a lone surrogate left in %s without a backslash before it',
    (expression, change, expected) => {
      expect(print(expression, change)).toStrictEqual(expected)
    },
  )

  it.each<[string, TextEdit, [string, string]]>([
    [
      String.raw`RegExp('\0?1')`,
      { start: 1, text: '', end: 2 },
      [String.raw`'\x001'`, String.raw`\x00`],
    ],
    [
      String.raw`RegExp('\0a')`,
      { text: '1', start: 1, end: 2 },
      [String.raw`'\x001'`, String.raw`\x001`],
    ],
    [
      String.raw`RegExp('\1?2')`,
      { start: 1, text: '', end: 2 },
      ["'\u{1}2'", '\u{1}'],
    ],
    [
      'RegExp(`\\0?1`)',
      { start: 1, text: '', end: 2 },
      ['`\\x001`', String.raw`\x00`],
    ],
    [
      String.raw`RegExp('\0?a')`,
      { start: 1, text: '', end: 2 },
      [String.raw`'\0a'`, ''],
    ],
    [
      String.raw`RegExp('\\0?1')`,
      { start: 2, text: '', end: 3 },
      [String.raw`'\\01'`, ''],
    ],
  ])(
    'keeps an escape before a digit in %s from turning octal',
    (expression, change, expected) => {
      expect(print(expression, change)).toStrictEqual(expected)
    },
  )

  it('keeps the escapes of a string outside the edit', () => {
    expect(
      printPatternEdit(readTestRegex(String.raw`RegExp('\x41\\d+')`), {
        text: '[^]',
        start: 1,
        end: 3,
      }),
    ).toStrictEqual({
      focus: { text: '[^]', start: 16, end: 19 },
      text: String.raw`'\x41[^]+'`,
    })
  })

  it('grows the end of the edit to a whole escape sequence', () => {
    expect(
      print(String.raw`RegExp('[\u{1F600}a]')`, { start: 1, text: '', end: 2 }),
    ).toStrictEqual([String.raw`'[\uDE00a]'`, String.raw`\uDE00`])
  })

  it('grows the edit to a whole escape sequence', () => {
    expect(
      print(String.raw`RegExp('[\u{1F600}a]')`, { start: 2, text: '', end: 3 }),
    ).toStrictEqual([String.raw`'[\uD83Da]'`, String.raw`\uD83D`])
  })

  it.each<[string, TextEdit, string]>([
    [
      String.raw`RegExp("a\"b")`,
      { text: '"', start: 0, end: 1 },
      String.raw`"\"\"b"`,
    ],
    ["RegExp('a')", { text: "\\'\n", start: 0, end: 1 }, String.raw`'\\\'\n'`],
    ['RegExp(`a`)', { text: '`\\', start: 0, end: 1 }, '`\\`\\\\`'],
    [
      'RegExp(String.raw`a`)',
      { text: String.raw`\d`, start: 0, end: 1 },
      'String.raw`\\d`',
    ],
  ])('writes new text in the form of %s', (expression, change, expected) => {
    expect(print(expression, change)[0]).toBe(expected)
  })

  it.each<[string, TextEdit, string]>([
    ['RegExp(`$a{`)', { start: 1, text: '', end: 2 }, '`\\${`'],
    ['RegExp(`ab{`)', { text: '$', start: 0, end: 2 }, '`\\${`'],
    ['RegExp(`$ab`)', { text: '{', start: 1, end: 2 }, '`\\${b`'],
  ])(
    'writes the whole template of %s anew when the edit joins a substitution',
    (expression, change, expected) => {
      expect(print(expression, change)[0]).toBe(expected)
    },
  )

  it('removes an anchor at an edge of a template with expressions', () => {
    let source = readTestRegex(`RegExp(\`^\${a}$\`)`)

    expect(printPatternEdit(source, { start: 0, text: '', end: 1 }).text).toBe(
      `\`\${a}$\``,
    )
    expect(printPatternEdit(source, { start: 5, text: '', end: 6 }).text).toBe(
      `\`^\${a}\``,
    )
  })
})
