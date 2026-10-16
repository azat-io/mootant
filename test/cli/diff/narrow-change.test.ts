import { describe, expect, it } from 'vitest'

import { splitGraphemes } from '../../../cli/terminal/get-display-width'
import { narrowChange } from '../../../cli/diff/narrow-change'

/**
 * Narrows a change and prints the changed parts.
 *
 * @param original - Text before the change.
 * @param replacement - Text after the change.
 * @returns Changed parts of both texts.
 */
function narrow(original: string, replacement: string): [string, string] {
  let before = splitGraphemes(original)
  let after = splitGraphemes(replacement)
  let part = narrowChange(before, after)
  return [
    before.slice(part.start, part.originalEnd).join(''),
    after.slice(part.start, part.replacementEnd).join(''),
  ]
}

describe('narrowChange', () => {
  it.each([
    ['depth > 0', 'depth >= 0', '>', '>='],
    ['depth === 0', 'depth <= 0', '===', '<='],
    ['limit = 10', 'limit = 11', '10', '11'],
    ['a ?? b', 'a || b', '??', '||'],
    ['a.b', 'a?.b', '.', '?.'],
    ["'ok'", "''", 'ok', ''],
    ['ready', 'true', 'ready', 'true'],
    ['same', 'same', '', ''],
  ])('narrows %s -> %s to %s -> %s', (original, replacement, ...expected) => {
    expect(narrow(original, replacement)).toStrictEqual(expected)
  })

  it('slides removed text to start and end between tokens', () => {
    expect(narrow('{ a: 1, b: 2, c: 3 }', '{ a: 1, c: 3 }')).toStrictEqual([
      'b: 2, ',
      '',
    ])
    expect(narrow('first(second)', 'first(x, second)')).toStrictEqual([
      '',
      'x, ',
    ])
  })

  it('slides removed text to the start or end of the range', () => {
    expect(narrow("a === 'x' || a === 'y'", "a === 'y'")).toStrictEqual([
      "a === 'x' || ",
      '',
    ])
    expect(narrow('x === undefined || x === 0', 'x === 0')).toStrictEqual([
      'x === undefined || ',
      '',
    ])
    expect(
      narrow(
        "error instanceof Error && error.name === 'E'",
        "error.name === 'E'",
      ),
    ).toStrictEqual(['error instanceof Error && ', ''])
    expect(narrow("a.refStyle === 'sha' && a.ref", 'a.ref')).toStrictEqual([
      "a.refStyle === 'sha' && ",
      '',
    ])
    expect(narrow("a === 'y' || a === 'x'", "a === 'y'")).toStrictEqual([
      " || a === 'x'",
      '',
    ])
  })

  it('slides removed text inside the given range only to its edges', () => {
    let before = splitGraphemes("f(a === 'x' || a === 'y')")
    let after = splitGraphemes("f(a === 'y')")

    expect(
      narrowChange(before, after, {
        replacementEnd: 11,
        originalEnd: 24,
        start: 2,
      }),
    ).toStrictEqual({ replacementEnd: 2, originalEnd: 15, start: 2 })
  })

  it('widens removed text that never lies between tokens', () => {
    expect(narrow('abcd', 'abd')).toStrictEqual(['abcd', 'abd'])
  })

  it('narrows only inside the given range', () => {
    let before = splitGraphemes('x = a + b')
    let after = splitGraphemes('x = a - b')

    expect(
      narrowChange(before, after, {
        replacementEnd: 9,
        originalEnd: 9,
        start: 4,
      }),
    ).toStrictEqual({ replacementEnd: 7, originalEnd: 7, start: 6 })
  })
})
