import { describe, expect, it } from 'vitest'

import type { MarkedGrapheme, MarkedDiff } from '../../../cli/diff/mark-diff'

import { getDisplayWidth } from '../../../cli/terminal/get-display-width'
import { createTextStyle } from '../../helpers/create-text-style'
import { formatDiff } from '../../../cli/diff/format-diff'
import { showEscapes } from '../../helpers/show-escapes'

/**
 * Builds a marked line from text with the changed part in brackets.
 *
 * @param text - Line such as `a [>] b`.
 * @returns Marked graphemes of the line.
 */
function mark(text: string): MarkedGrapheme[] {
  let changed = false
  let line: MarkedGrapheme[] = []
  for (let character of text) {
    if (character === '[' || character === ']') {
      changed = character === '['
    } else {
      line.push({ text: character, changed })
    }
  }
  return line
}

/**
 * Builds a marked diff from lines with changed parts in brackets.
 *
 * @param before - Lines before the mutant.
 * @param after - Lines after the mutant.
 * @param cuts - Whether the lines are cut at their start or end.
 * @returns Marked diff.
 */
function createDiff(
  before: string[],
  after: string[],
  cuts: Partial<Pick<MarkedDiff, 'cutStart' | 'cutEnd'>> = {},
): MarkedDiff {
  return {
    cutStart: cuts.cutStart ?? false,
    cutEnd: cuts.cutEnd ?? false,
    before: before.map(mark),
    after: after.map(mark),
  }
}

describe('formatDiff', () => {
  it('prints both sides with markers and colors the changed characters', () => {
    expect(
      formatDiff(
        createDiff(['  a [>] b'], ['  a [>=] b']),
        createTextStyle({ colors: true }),
      ).map(showEscapes),
    ).toStrictEqual(['<31>-<39> a <31>><39> b', '<32>+<39> a <32>>=<39> b'])
  })

  it('prints a marker alone for an empty line', () => {
    expect(
      formatDiff(createDiff(['[f()]'], ['']), createTextStyle()),
    ).toStrictEqual(['- f()', '+'])
  })

  it('names how many lines a long side leaves out', () => {
    expect(
      formatDiff(
        createDiff(['[a]', '[b]', '[c]', '[d]', '[e]'], ['[x]']),
        createTextStyle(),
      ),
    ).toStrictEqual(['- a', '- b', '- … 2 lines', '- e', '+ x'])
    expect(
      formatDiff(
        createDiff(['[a]', '[b]', '[c]', '[d]'], ['[x]']),
        createTextStyle(),
      ),
    ).toHaveLength(5)
  })

  it('leaves out unchanged lines away from the change', () => {
    expect(
      formatDiff(
        createDiff(
          [
            'summary: {',
            '  a: 1,',
            '  b: 2,',
            '  [c: 3,]',
            '  d: 4,',
            '  e: 5,',
            '  f: 6,',
            '}',
          ],
          [
            'summary: {',
            '  a: 1,',
            '  b: 2,',
            '  d: 4,',
            '  e: 5,',
            '  f: 6,',
            '}',
          ],
        ),
        createTextStyle(),
      ),
    ).toStrictEqual([
      '- … 2 lines',
      '-   b: 2,',
      '-   c: 3,',
      '-   d: 4,',
      '- … 3 lines',
      '+ … 2 lines',
      '+   b: 2,',
      '+   d: 4,',
      '+ … 3 lines',
    ])
  })

  it('keeps an unchanged line it would only replace with a note', () => {
    expect(
      formatDiff(
        createDiff(['a', 'b', '[c]', 'd', 'e'], ['a', 'b', '[x]', 'd', 'e']),
        createTextStyle(),
      ),
    ).toStrictEqual([
      '- a',
      '- b',
      '- c',
      '- d',
      '- e',
      '+ a',
      '+ b',
      '+ x',
      '+ d',
      '+ e',
    ])
  })

  it('shows the lines of a side without changed characters', () => {
    expect(
      formatDiff(
        createDiff(['a', 'b', 'c'], ['a', 'b', 'c']),
        createTextStyle(),
      ),
    ).toStrictEqual(['- a', '- b', '- c', '+ a', '+ b', '+ c'])
  })

  it('marks lines the report cut at their start and end', () => {
    expect(
      formatDiff(
        createDiff(['a [+] b'], ['a [-] b'], { cutStart: true, cutEnd: true }),
        createTextStyle(),
      ),
    ).toStrictEqual(['- …a + b…', '+ …a - b…'])
    expect(
      formatDiff(
        createDiff(['  f([', '  x', '  ])'], ['  f()'], { cutStart: true }),
        createTextStyle({ unicode: false }),
      ),
    ).toStrictEqual(['- ...f(', '- x', '- )', '+ ...f()'])
  })

  it('names left-out lines in ASCII', () => {
    expect(
      formatDiff(
        createDiff(['[a]', '[b]', '[c]', '[d]', '[e]'], ['x']),
        createTextStyle({ unicode: false }),
      )[2],
    ).toBe('- ... 2 lines')
  })

  it('starts a change too wide for the line where it starts', () => {
    expect(
      formatDiff(
        createDiff([`f([${'a'.repeat(30)}])`], [`f([${'b'.repeat(30)}])`]),
        createTextStyle({ width: 20 }),
      ),
    ).toStrictEqual([`- f(${'a'.repeat(15)}…`, `+ f(${'b'.repeat(15)}…`])
  })

  it('keeps lines of spaces as they are', () => {
    expect(
      formatDiff(createDiff(['[  ]'], ['']), createTextStyle()),
    ).toStrictEqual(['-   ', '+'])
  })

  it('keeps a line without the change cut at its end', () => {
    expect(
      formatDiff(
        createDiff(['[x]', 'y'.repeat(30)], ['']),
        createTextStyle({ width: 20 }),
      ),
    ).toStrictEqual(['- x', `- ${'y'.repeat(17)}…`, '+'])
  })

  it('fits wide characters in the width', () => {
    let lines = formatDiff(
      createDiff([`${'字'.repeat(20)} [a]`], [`${'字'.repeat(20)} [b]`]),
      createTextStyle({ width: 20 }),
    )

    expect(lines).toStrictEqual(['- …字字字字字字字 a', '+ …字字字字字字字 b'])
    expect(lines.every(line => getDisplayWidth(line) <= 20)).toBe(true)
  })

  it('shows an ellipsis alone for a line left of the visible columns', () => {
    expect(
      formatDiff(
        createDiff(
          ['}', `${'word '.repeat(10)}[x]`],
          ['}', `${'word '.repeat(10)}[y]`],
        ),
        createTextStyle({ width: 20 }),
      ),
    ).toStrictEqual([
      '- …',
      '- … word word word x',
      '+ …',
      '+ … word word word y',
    ])
  })
})
