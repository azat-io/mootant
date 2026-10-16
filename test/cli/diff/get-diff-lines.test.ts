// spell-checker:ignore FEFF
import { describe, expect, it } from 'vitest'

import { getLineStarts } from '../../../core/text/get-line-starts'
import { getDiffLines } from '../../../cli/diff/get-diff-lines'

/**
 * Gets the diff lines of replacing the first occurrence of a fragment.
 *
 * @param source - Text of the file.
 * @param fragment - Text to replace.
 * @param replacement - Text written in its place.
 * @returns Lines before and after.
 */
function diff(
  source: string,
  fragment: string,
  replacement: string,
): ReturnType<typeof getDiffLines> {
  let start = source.indexOf(fragment)
  return getDiffLines(source, getLineStarts(source), {
    end: start + fragment.length,
    replacement,
    start,
  })
}

describe('getDiffLines', () => {
  it('gives the line of a change before and after it', () => {
    expect(diff('a()\nlet x = 1 + 2\nb()', '1 + 2', '1 - 2')).toStrictEqual({
      before: ['let x = 1 + 2'],
      after: ['let x = 1 - 2'],
      cutStart: 0,
      cutEnd: 0,
    })
  })

  it('gives every line a change spans, with any line breaks', () => {
    expect(
      diff('if (a) {\r\n  b()\r\n}\r\nc()', 'if (a) {\r\n  b()\r\n}', ';'),
    ).toStrictEqual({
      before: ['if (a) {', '  b()', '}'],
      after: [';'],
      cutStart: 0,
      cutEnd: 0,
    })
    expect(diff('f(a)\u{2028}g()', 'a', 'x,\ny')).toStrictEqual({
      after: ['f(x,', 'y)'],
      before: ['f(a)'],
      cutStart: 0,
      cutEnd: 0,
    })
  })

  it('leaves out a byte order mark', () => {
    expect(diff('\u{FEFF}let x = 1', '1', '2')).toStrictEqual({
      before: ['let x = 1'],
      after: ['let x = 2'],
      cutStart: 0,
      cutEnd: 0,
    })
  })

  it('keeps at most 80 code units of a long line around the change', () => {
    let lead = 'a'.repeat(90)
    let trail = 'b'.repeat(85)

    expect(diff(`${lead}+${trail}\nc`, '+', '-')).toStrictEqual({
      before: [`${'a'.repeat(80)}+${'b'.repeat(80)}`],
      after: [`${'a'.repeat(80)}-${'b'.repeat(80)}`],
      cutStart: 10,
      cutEnd: 5,
    })
    expect(diff(`${lead}(\n  x\n)${trail}`, `(\n  x\n)`, '()')).toStrictEqual({
      before: [`${'a'.repeat(80)}(`, '  x', `)${'b'.repeat(80)}`],
      after: [`${'a'.repeat(80)}()${'b'.repeat(80)}`],
      cutStart: 10,
      cutEnd: 5,
    })
  })

  it('keeps a surrogate pair whole where it cuts a long line', () => {
    let lead = `${'😀'.repeat(41)}a`
    let trail = `b${'😀'.repeat(41)}`

    expect(diff(`${lead}+${trail}`, '+', '-')).toStrictEqual({
      before: [`${'😀'.repeat(39)}a+b${'😀'.repeat(40)}`],
      after: [`${'😀'.repeat(39)}a-b${'😀'.repeat(40)}`],
      cutStart: 4,
      cutEnd: 2,
    })
  })
})
