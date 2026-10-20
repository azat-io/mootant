import { describe, expect, it } from 'vitest'

import type { DiffEntry } from '../../../cli/diff/format-diff-groups'

import { getDisplayWidth } from '../../../cli/terminal/get-display-width'
import { formatDiffGroups } from '../../../cli/diff/format-diff-groups'
import { createTextStyle } from '../../helpers/create-text-style'
import { showEscapes } from '../../helpers/show-escapes'

/**
 * Builds a mutant of `src/a.ts` that turns `a > b` into `a >= b` on line 1.
 *
 * @param fields - Fields that differ.
 * @returns Entry of a report.
 */
function createEntry(
  fields: { file?: string; line?: number } & Partial<DiffEntry> = {},
): DiffEntry {
  let { file = 'src/a.ts', line = 1, ...rest } = fields
  return {
    mutant: {
      mutator: 'comparison-operator',
      before: ['if (a > b) {'],
      after: ['if (a >= b) {'],
      endColumn: 10,
      cutStart: 0,
      cutEnd: 0,
      column: 5,
      line,
      file,
    },
    details: [],
    id: 'ab12',
    ...rest,
  }
}

describe('formatDiffGroups', () => {
  it('groups mutants by file in the order of their first mutant and aligns headings', () => {
    let condition = createEntry({ id: 'cd34', line: 12 })
    condition.mutant.mutator = 'condition'

    expect(
      formatDiffGroups(
        [
          createEntry(),
          createEntry({ details: ['why it failed'], file: 'src/b.ts' }),
          condition,
        ],
        createTextStyle(),
      ),
    ).toBe(
      [
        'src/a.ts',
        '  1:5   comparison-operator  ab12',
        '    - if (a > b) {',
        '    + if (a >= b) {',
        '',
        '  12:5  condition            cd34',
        '    - if (a > b) {',
        '    + if (a >= b) {',
        '',
        'src/b.ts',
        '  1:5  comparison-operator  ab12',
        '    - if (a > b) {',
        '    + if (a >= b) {',
        '    why it failed',
      ].join('\n'),
    )
  })

  it('places a mutant at its focus', () => {
    let entry = createEntry()
    entry.mutant.focus = {
      replacement: '>=',
      original: '>',
      column: 7,
      start: 6,
      line: 1,
      end: 7,
    }

    expect(formatDiffGroups([entry], createTextStyle()).split('\n', 2)[1]).toBe(
      '  1:7  comparison-operator  ab12',
    )
  })

  it('colors the path, the heading and the details', () => {
    expect(
      showEscapes(
        formatDiffGroups(
          [createEntry({ details: ['why'] })],
          createTextStyle({ colors: true }),
        ),
      ),
    ).toBe(
      [
        '<1>src/a.ts<22>',
        '  <90>1:5<39>  <90>comparison-operator<39>  ab12',
        '    <31>-<39> if (a <31>><39> b) {',
        '    <32>+<39> if (a <32>>=<39> b) {',
        '    <90>why<39>',
      ].join('\n'),
    )
  })

  it('cuts paths, mutators and details to a narrow terminal', () => {
    let entry = createEntry({
      file: `src/${'deep/'.repeat(10)}a.ts`,
      details: ['x'.repeat(60)],
    })
    entry.mutant.mutator = 'acme/a-very-long-mutator-name'

    let lines = formatDiffGroups([entry], createTextStyle({ width: 30 })).split(
      '\n',
    )

    expect(lines).toStrictEqual([
      `…${'deep/'.repeat(5)}a.ts`,
      '  1:5  acme/a-very-long…  ab12',
      '    - if (a > b) {',
      '    + if (a >= b) {',
      `    ${'x'.repeat(25)}…`,
    ])
    expect(lines.every(line => getDisplayWidth(line) <= 30)).toBe(true)
  })

  it('keeps the label and the end of the path of a detail line', () => {
    let file =
      'test/features/billing/invoices/calculations/compute-invoice-total.test.ts'
    let entry = createEntry({ details: [{ label: 'test: ', path: file }] })

    let wide = formatDiffGroups([entry], createTextStyle({ width: 80 }))
    let narrow = formatDiffGroups(
      [entry],
      createTextStyle({ unicode: false, width: 40 }),
    )

    expect(wide.split('\n').at(-1)).toBe(`    test: …${file.slice(-69)}`)
    expect(narrow.split('\n').at(-1)).toBe(`    test: ...${file.slice(-27)}`)
    expect(wide.split('\n').every(line => getDisplayWidth(line) <= 80)).toBe(
      true,
    )
    expect(narrow.split('\n').every(line => getDisplayWidth(line) <= 40)).toBe(
      true,
    )
    expect(
      formatDiffGroups([entry], createTextStyle()).split('\n').at(-1),
    ).toBe(`    test: ${file}`)
  })

  it('returns an empty text without entries', () => {
    expect(formatDiffGroups([], createTextStyle())).toBe('')
  })

  it('keeps diff lines within 160 columns without a width, not details', () => {
    let line = `x(${'a'.repeat(100)} > ${'b'.repeat(100)})`
    let detail = 'why '.repeat(50)
    let text = formatDiffGroups(
      [
        createEntry({
          mutant: {
            ...createEntry().mutant,
            after: [line.replace('>', '>=')],
            before: [line],
            endColumn: 107,
            cutStart: 0,
            column: 104,
            cutEnd: 0,
          },
          details: [detail],
        }),
      ],
      createTextStyle(),
    )
    let lines = text.split('\n')

    expect(lines.slice(2, 4).map(getDisplayWidth)).toStrictEqual([160, 160])
    expect(lines[2]).toMatch(/^ {4}- x\(a+ > b+…$/u)
    expect(lines[4]).toBe(`    ${detail}`)
  })
})
