import { describe, expect, it } from 'vitest'

import type { EntryRow } from '../../../cli/report/format-file-groups'

import { formatFileGroups } from '../../../cli/report/format-file-groups'
import { getDisplayWidth } from '../../../cli/terminal/get-display-width'
import { createTextStyle } from '../../helpers/create-text-style'
import { showEscapes } from '../../helpers/show-escapes'

/**
 * Builds a row of `src/a.ts` with an id and a status.
 *
 * @param fields - Fields that differ.
 * @returns Row of a report.
 */
function createRow(
  fields: { status?: string; id?: string } & Partial<EntryRow> = {},
): EntryRow {
  let { status = 'survived', id = 'ab12', ...rest } = fields
  return {
    change: { replacement: 'a >= b', original: 'a > b' },
    tail: [{ text: id }, { text: status }],
    mutator: 'comparison-operator',
    file: 'src/a.ts',
    location: '1:5',
    details: [],
    ...rest,
  }
}

describe('formatFileGroups', () => {
  it('groups rows by file in the order of their first row and aligns columns', () => {
    expect(
      formatFileGroups(
        [
          createRow(),
          createRow({ details: ['why it failed'], file: 'src/b.ts' }),
          createRow({
            change: { replacement: 'true', original: 'ready' },
            status: 'no coverage',
            mutator: 'condition',
            location: '12:10',
            id: 'cd34',
          }),
        ],
        createTextStyle(),
      ),
    ).toBe(
      [
        'src/a.ts',
        '  1:5    comparison-operator  a > b → a >= b  ab12  survived',
        '  12:10  condition            ready → true    cd34  no coverage',
        '',
        'src/b.ts',
        '  1:5  comparison-operator  a > b → a >= b  ab12  survived',
        '       why it failed',
      ].join('\n'),
    )
  })

  it('returns an empty text without rows', () => {
    expect(formatFileGroups([], createTextStyle())).toBe('')
  })

  it('colors the heading, locations, mutators, details and colored cells', () => {
    let style = createTextStyle({ colors: true })

    expect(
      showEscapes(
        formatFileGroups(
          [
            createRow({
              tail: [
                { text: 'ab12' },
                { color: style.colors.red, text: 'error' },
              ],
              details: ['boom'],
            }),
          ],
          style,
        ),
      ),
    ).toBe(
      [
        '<1>src/a.ts<22>',
        '  <90>1:5<39>  <90>comparison-operator<39>  a > b → a >= b  ab12  <31>error<39>',
        '       <90>boom<39>',
      ].join('\n'),
    )
  })

  it('pads changes of a usual width only', () => {
    let rows = [
      createRow(),
      createRow({ change: { original: 'x'.repeat(70), replacement: 'y' } }),
      createRow({ change: { replacement: 'c', original: 'b' } }),
    ]

    expect(formatFileGroups(rows, createTextStyle()).split('\n')).toStrictEqual(
      [
        'src/a.ts',
        '  1:5  comparison-operator  a > b → a >= b  ab12  survived',
        `  1:5  comparison-operator  ${'x'.repeat(59)}… → y  ab12  survived`,
        '  1:5  comparison-operator  b → c           ab12  survived',
      ],
    )
  })

  it('aligns columns with wide characters', () => {
    let rows = [
      createRow({ change: { original: "'大きい数字'", replacement: "''" } }),
      createRow({ change: { replacement: "''", original: '🎉 x' } }),
      createRow({ tail: [{ text: '日本' }, { text: 'survived' }] }),
    ]

    expect(formatFileGroups(rows, createTextStyle()).split('\n')).toStrictEqual(
      [
        'src/a.ts',
        "  1:5  comparison-operator  '大きい数字' → ''  ab12  survived",
        "  1:5  comparison-operator  🎉 x → ''          ab12  survived",
        '  1:5  comparison-operator  a > b → a >= b     日本  survived',
      ],
    )
  })

  it('cuts changes, details and headings to the width', () => {
    let rows = [
      createRow({
        change: {
          replacement: 'value.length <= limit',
          original: 'value.length < limit',
        },
        file: `src/${'deep/'.repeat(20)}a.ts`,
        details: ['d'.repeat(100)],
      }),
    ]
    let lines = formatFileGroups(rows, createTextStyle({ width: 80 })).split(
      '\n',
    )

    expect(lines).toStrictEqual([
      `…${'deep/'.repeat(15)}a.ts`,
      '  1:5  comparison-operator  ….length < limit → ….length <= limit  ab12  survived',
      `       ${'d'.repeat(72)}…`,
    ])
    expect(lines.map(line => getDisplayWidth(line) <= 80)).toStrictEqual([
      true,
      true,
      true,
    ])
  })

  it('puts each change under its row in a narrow terminal', () => {
    let lines = formatFileGroups(
      [
        createRow({ status: 'no coverage', details: ['reason'] }),
        createRow({
          change: { original: '大きい数字です'.repeat(5), replacement: "''" },
        }),
      ],
      createTextStyle({ width: 50 }),
    ).split('\n')

    expect(lines).toStrictEqual([
      'src/a.ts',
      '  1:5  comparison-operator  ab12  no coverage',
      '       a > b → a >= b',
      '       reason',
      '  1:5  comparison-operator  ab12  survived',
      "       大きい数字です大きい数字です大きい数… → ''",
    ])
    expect(lines.filter(line => getDisplayWidth(line) > 50)).toStrictEqual([])
  })
})
