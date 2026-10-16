import { describe, expect, it } from 'vitest'

import type { MarkedGrapheme } from '../../../cli/diff/mark-diff'

import { markDiff } from '../../../cli/diff/mark-diff'

/**
 * Prints marked lines with the changed characters in brackets.
 *
 * @param lines - Marked lines.
 * @returns Lines as text.
 */
function show(lines: MarkedGrapheme[][]): string[] {
  return lines.map(line =>
    line
      .map(grapheme =>
        grapheme.changed ? `[${grapheme.text}]` : grapheme.text,
      )
      .join('')
      .replaceAll('][', ''),
  )
}

describe('markDiff', () => {
  it('marks the changed words of a mutant', () => {
    let marked = markDiff({
      diff: {
        before: ['  x = a ?? b'],
        after: ['  x = a || b'],
        cutStart: 0,
        cutEnd: 0,
      },
      endColumn: 13,
      column: 7,
      line: 3,
    })

    expect(show(marked.before)).toStrictEqual(['  x = a [??] b'])
    expect(show(marked.after)).toStrictEqual(['  x = a [||] b'])
  })

  it('marks across lines', () => {
    let marked = markDiff({
      diff: {
        before: ['if (a) {', '  b()', '}'],
        after: [';'],
        cutStart: 0,
        cutEnd: 0,
      },
      endColumn: 2,
      column: 1,
      line: 1,
    })

    expect(show(marked.before)).toStrictEqual(['[if (a) {]', '[  b()]', '[}]'])
    expect(show(marked.after)).toStrictEqual(['[;]'])
  })

  it('marks a focus that the replacement applies as it is', () => {
    let marked = markDiff({
      focus: {
        replacement: '[^]',
        original: '[0-9]',
        column: 3,
        start: 20,
        line: 2,
        end: 25,
      },
      diff: {
        before: ['f(', '/x[0-9]/'],
        after: ['f(', '/x[^]/'],
        cutStart: 0,
        cutEnd: 0,
      },
      endColumn: 9,
      column: 1,
      line: 1,
    })

    expect(show(marked.before)).toStrictEqual(['f(', '/x[[0-9]]/'])
    expect(show(marked.after)).toStrictEqual(['f(', '/x[[^]]/'])
  })

  it('shifts columns of lines the report cut', () => {
    let marked = markDiff({
      focus: {
        replacement: '[^]',
        original: '[0-9]',
        column: 16,
        start: 15,
        line: 1,
        end: 20,
      },
      diff: {
        before: ['= /x[0-9]/.test(a)'],
        after: ['= /x[^]/.test(a)'],
        cutStart: 10,
        cutEnd: 30,
      },
      endColumn: 21,
      column: 13,
      line: 1,
    })

    expect(show(marked.before)).toStrictEqual(['= /x[[0-9]]/.test(a)'])
    expect(show(marked.after)).toStrictEqual(['= /x[[^]]/.test(a)'])
    expect(marked).toMatchObject({ cutStart: true, cutEnd: true })
  })

  it('shifts only the first line of a multi-line mutant the report cut', () => {
    let marked = markDiff({
      diff: {
        before: ['x = f(', '  a,', ') ?? b'],
        after: ['x = f(', '  a,', ') || b'],
        cutStart: 4,
        cutEnd: 0,
      },
      endColumn: 7,
      column: 9,
      line: 1,
    })

    expect(show(marked.before)).toStrictEqual(['x = f(', '  a,', ') [??] b'])
    expect(marked).toMatchObject({ cutStart: true, cutEnd: false })
  })
})
