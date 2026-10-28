// spell-checker:ignore tymh jkpx gfkw acyn vzjm patt
import { describe, expect, it } from 'vitest'

import type { ListReportSkipped } from '../../../types/report/list-report-skipped'
import type { ListReport } from '../../../types/report/list-report'

import { createListReportMutant } from '../../helpers/create-list-report-mutant'
import { formatTextReport } from '../../../cli/report/format-text-report'
import { createListReport } from '../../helpers/create-list-report'
import { createTextStyle } from '../../helpers/create-text-style'
import { showEscapes } from '../../helpers/show-escapes'

/**
 * Creates a skipped candidate at the start of `example.ts`.
 *
 * @param overrides - Fields that differ from the default candidate.
 * @returns Skipped candidate as the report holds it.
 */
function createSkipped(
  overrides: Partial<ListReportSkipped>,
): ListReportSkipped {
  return {
    reason: 'the type hints prove the comparison is always false',
    mutator: 'comparison-operator',
    rule: 'proven-comparison',
    category: 'equivalent',
    original: 'a === null',
    replacement: 'false',
    file: 'example.ts',
    heuristic: true,
    column: 5,
    start: 4,
    by: null,
    line: 1,
    end: 14,
    ...overrides,
  }
}

/**
 * Formats a list report as `mootant list src` without colors or width limit.
 *
 * @param report - Report to format.
 * @param style - Settings of the style that differ.
 * @returns Text of the report.
 */
function format(
  report: ListReport,
  style: Parameters<typeof createTextStyle>[0] = {},
): string {
  return formatTextReport(report, {
    style: createTextStyle(style),
    command: 'mootant list src',
    verbose: false,
  })
}

describe('formatTextReport', () => {
  it('prints a header, the mutants grouped by file with short ids, then the counts', () => {
    let ignored = { file: 'src/cart.ts', status: 'Ignored' } as const
    let pending = { file: 'src/cart.ts' }
    let legacy = {
      ...ignored,
      reason: 'legacy formatting, covered elsewhere',
      line: 18,
    }
    let mutants = [
      createListReportMutant({
        ...pending,
        original: "emit('add', label?.trim())",
        mutator: 'statement-removal',
        // spell-checker: disable-next-line
        id: 'tymhtfmk7wf5',
        replacement: ';',
        column: 5,
        line: 6,
      }),
      createListReportMutant({
        ...ignored,
        reason: 'event name',
        // spell-checker: disable-next-line
        id: 'w7019f5axk5g',
        original: "'add'",
        column: 10,
        line: 6,
      }),
      createListReportMutant({
        ...pending,
        mutator: 'optional-chaining',
        replacement: 'label.trim()',
        original: 'label?.trim()',
        // spell-checker: disable-next-line
        id: 'jkpx0bx1hbwj',
        column: 17,
        line: 6,
      }),
      createListReportMutant({
        ...pending,
        original: 'this.items.push(price)',
        mutator: 'statement-removal',
        // spell-checker: disable-next-line
        id: 'twr1h5gd5w42',
        replacement: ';',
        column: 5,
        line: 7,
      }),
      createListReportMutant({
        ...pending,
        mutator: 'statement-removal',
        original: 'notify()',
        // spell-checker: disable-next-line
        id: 'gfkwqsq7yvfd',
        replacement: ';',
        column: 5,
        line: 8,
      }),
      createListReportMutant({
        ...pending,
        mutator: 'arithmetic-operator',
        replacement: 'acc - item',
        original: 'acc + item',
        // spell-checker: disable-next-line
        id: '3nsqarb4qvhm',
        column: 48,
        line: 12,
      }),
      createListReportMutant({
        ...pending,
        mutator: 'comparison-operator',
        replacement: 'sum >= 100',
        original: 'sum > 100',
        id: 'gf7s9ez5kts4',
        column: 12,
        line: 13,
      }),
      createListReportMutant({
        ...pending,
        mutator: 'comparison-operator',
        original: 'sum > 100',
        replacement: 'false',
        // spell-checker: disable-next-line
        id: 'acynpqjdm30h',
        column: 12,
        line: 13,
      }),
      createListReportMutant({
        ...pending,
        mutator: 'arithmetic-operator',
        replacement: 'sum / rate',
        original: 'sum * rate',
        // spell-checker: disable-next-line
        id: 'vzjmjad49zs4',
        column: 24,
        line: 13,
      }),
      createListReportMutant({
        ...legacy,
        mutator: 'comparison-operator',
        replacement: 'count <= 2',
        original: 'count < 2',
        // spell-checker: disable-next-line
        id: 'v7skpar6108w',
        column: 48,
      }),
      createListReportMutant({
        ...legacy,
        mutator: 'comparison-operator',
        original: 'count < 2',
        replacement: 'false',
        // spell-checker: disable-next-line
        id: 'pq44a3xxdefh',
        column: 48,
      }),
      createListReportMutant({
        ...legacy,
        // spell-checker: disable-next-line
        id: '0swkcdtty456',
        original: "'item'",
        column: 60,
      }),
      createListReportMutant({
        ...legacy,
        original: "'items'",
        id: 'tj6he114jb6k',
        column: 69,
      }),
      createListReportMutant({
        ...pending,
        // spell-checker: disable-next-line
        id: 'j5y7xqje89xp',
        original: "'cm'",
        column: 19,
        line: 23,
      }),
    ]

    let report = createListReport(mutants, {
      totalWarnings: 2,
      totalMutants: 14,
      totalPending: 9,
      totalIgnored: 5,
    })
    report.mutants.push(
      createListReportMutant({ id: 'zz0000000001', file: 'src/a.ts', line: 2 }),
    )

    expect(format(report)).toMatchInlineSnapshot(`
      "● mootant list src                                                                preset recommended

      mutants         14 in 1 file, 5 ignored
      warnings        2

      src/cart.ts
        6:5    statement-removal    emit('add', label?.trim()) → ;  tymh
        6:10   string-literal       'add' → ''                      w701  ignored: event name
        6:17   optional-chaining    label?.trim() → label.trim()    jkpx
        7:5    statement-removal    this.items.push(price) → ;      twr1
        8:5    statement-removal    notify() → ;                    gfkw
        12:48  arithmetic-operator  acc + item → acc - item         3nsq
        13:12  comparison-operator  sum > 100 → sum >= 100          gf7s
        13:12  comparison-operator  sum > 100 → false               acyn
        13:24  arithmetic-operator  sum * rate → sum / rate         vzjm
        18:48  comparison-operator  count < 2 → count <= 2          v7sk  ignored: legacy formatting, covered elsewhere
        18:48  comparison-operator  count < 2 → false               pq44  ignored: legacy formatting, covered elsewhere
        18:60  string-literal       'item' → ''                     0swk  ignored: legacy formatting, covered elsewhere
        18:69  string-literal       'items' → ''                    tj6h  ignored: legacy formatting, covered elsewhere
        23:19  string-literal       'cm' → ''                       j5y7

      src/a.ts
        2:12  string-literal  'cm' → ''  zz00"
    `)
  })

  it('colors the header, labels, locations and ignored reasons', () => {
    let report = createListReport([
      createListReportMutant({ status: 'Ignored', reason: 'units' }),
    ])

    expect(showEscapes(format(report, { colors: true })))
      .toMatchInlineSnapshot(`
        "<92>●<39> <1>mootant list src<22>                        <90>preset recommended<39>

        <90>mutants         <39>1 in 1 file

        <1>example.ts<22>
          <90>1:12<39>  <90>string-literal<39>  'cm' → ''  0000  <90>ignored: units<39>"
      `)
  })

  it('marks an ignored mutant without a reason', () => {
    let report = createListReport([
      createListReportMutant({ status: 'Ignored' }),
    ])

    expect(format(report).split('\n', 6)[5]).toBe(
      "  1:12  string-literal  'cm' → ''  0000  ignored",
    )
  })

  it('falls back to ASCII and cuts long changes to a narrow terminal', () => {
    let report = createListReport([
      createListReportMutant({
        original: `'${'long text '.repeat(6)}'`,
        replacement: "''",
      }),
    ])

    expect(format(report, { unicode: false, width: 50 }))
      .toMatchInlineSnapshot(`
        "* mootant list src              preset recommended

        mutants         1 in 1 file

        example.ts
          1:12  string-literal  0000
                'long text long text long text lo... -> ''"
      `)
  })

  it('prints only the header and the counts without mutants', () => {
    expect(
      format(
        createListReport([], {
          totalPending: 0,
          totalMutants: 0,
          totalErrors: 1,
          totalFiles: 2,
        }),
      ),
    ).toMatchInlineSnapshot(`
      "● mootant list src                        preset recommended

      mutants         0 in 2 files
      errors          1"
    `)
  })

  it('prints the skipped section after the mutants with counts by category', () => {
    let report = createListReport([createListReportMutant()], {
      skippedByCategory: {
        equivalent: 1,
        duplicate: 0,
        subsumed: 0,
        timeout: 0,
        invalid: 0,
        owned: 1,
        noise: 0,
      },
      totalSkipped: 2,
    })
    report.skipped = [
      createSkipped({}),
      createSkipped({
        reason:
          'logical-operator owns the truth value of a boolean-mode operand',
        file: 'src/example.ts',
        mutator: 'condition',
        replacement: 'true',
        category: 'owned',
        original: 'ready',
        rule: 'O3',
        line: 12,
      }),
    ]

    expect(format(report)).toMatchInlineSnapshot(`
      "● mootant list src                                         preset recommended

      mutants         1 in 1 file
      skipped         2: 1 equivalent, 1 owned

      example.ts
        1:12  string-literal  'cm' → ''  0000

      skipped:

      example.ts
        1:5  comparison-operator  a === null → false  equivalent  proven-comparison
             the type hints prove the comparison is always false

      src/example.ts
        12:5  condition  ready → true  owned  O3
              logical-operator owns the truth value of a boolean-mode operand"
    `)
  })

  it('counts no skipped candidates when nothing is skipped', () => {
    let report = createListReport([], {
      skippedByCategory: {
        equivalent: 0,
        duplicate: 0,
        subsumed: 0,
        timeout: 0,
        invalid: 0,
        owned: 0,
        noise: 0,
      },
      totalPending: 0,
      totalMutants: 0,
      totalSkipped: 0,
    })
    report.skipped = []

    expect(format(report).split('\n', 4)[3]).toBe(`${'skipped'.padEnd(16)}0`)
  })

  it('prints the focus of a mutant and of a skipped candidate', () => {
    let focus = {
      replacement: '',
      original: '^',
      column: 6,
      start: 5,
      line: 1,
      end: 6,
    }
    let text = format({
      ...createListReport(
        [
          createListReportMutant({
            mutator: 'regex-pattern',
            replacement: '/a$/',
            original: '/^a$/',
            column: 5,
            focus,
          }),
        ],
        {
          skippedByCategory: {
            equivalent: 1,
            duplicate: 0,
            subsumed: 0,
            timeout: 0,
            invalid: 0,
            owned: 0,
            noise: 0,
          },
          totalSkipped: 1,
        },
      ),
      skipped: [
        createSkipped({
          mutator: 'regex-pattern',
          replacement: '/a$/',
          original: '/^a$/',
          column: 5,
          focus,
        }),
      ],
    })

    expect(text.split('\n').slice(5, 13)).toStrictEqual([
      'example.ts',
      '  1:6  regex-pattern  ^ → (empty)  0000',
      '',
      'skipped:',
      '',
      'example.ts',
      '  1:6  regex-pattern  ^ → (empty)  equivalent  proven-comparison',
      '       the type hints prove the comparison is always false',
    ])
  })

  it('sorts the mutants of a file by the position they show', () => {
    let text = format(
      createListReport([
        createListReportMutant({
          focus: {
            replacement: 'i',
            original: '',
            column: 21,
            start: 20,
            line: 1,
            end: 20,
          },
          mutator: 'regex-flag',
          id: 'flag',
          column: 14,
        }),
        createListReportMutant({
          focus: {
            replacement: '',
            original: '^',
            column: 15,
            start: 14,
            line: 1,
            end: 15,
          },
          mutator: 'regex-pattern',
          id: 'pattern',
          column: 14,
        }),
      ]),
    )

    expect(text.split('\n').slice(5, 7)).toStrictEqual([
      '  1:15  regex-pattern  ^ → (empty)  patt',
      '  1:21  regex-flag     (empty) → i  flag',
    ])
  })
})
