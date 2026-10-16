import { describe, expect, it } from 'vitest'

import { sortByLocation } from '../../../cli/report/sort-by-location'

/**
 * Builds a focus on the second line.
 *
 * @param column - 1-based column.
 * @returns Focus of a report entry.
 */
function focusAt(column: number): {
  replacement: string
  original: string
  column: number
  start: number
  line: number
  end: number
} {
  return { replacement: '', original: 'x', start: 0, line: 2, end: 1, column }
}

describe('sortByLocation', () => {
  it('sorts the entries of a file by the position they show', () => {
    let entries = [
      { focus: focusAt(21), file: 'a.js', id: 'flag', column: 10, line: 2 },
      {
        focus: focusAt(14),
        id: 'pattern',
        file: 'a.js',
        column: 10,
        line: 2,
      },
      { file: 'a.js', id: 'string', column: 30, line: 2 },
      { file: 'a.js', id: 'first', column: 1, line: 1 },
    ]

    expect(sortByLocation(entries).map(entry => entry.id)).toStrictEqual([
      'first',
      'pattern',
      'flag',
      'string',
    ])
  })

  it('keeps the order of files and of entries at one position', () => {
    let entries = [
      { file: 'b.js', column: 5, id: 'b', line: 3 },
      { file: 'a.js', column: 1, id: 'a2', line: 1 },
      { file: 'a.js', column: 1, id: 'a1', line: 1 },
      { file: 'b.js', column: 1, id: 'b0', line: 1 },
    ]

    expect(sortByLocation(entries).map(entry => entry.id)).toStrictEqual([
      'b0',
      'b',
      'a2',
      'a1',
    ])
  })
})
