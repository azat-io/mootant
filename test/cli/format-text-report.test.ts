import { describe, expect, it } from 'vitest'

import type { ListReportSummary } from '../../types/list-report-summary'
import type { ListReportSkipped } from '../../types/list-report-skipped'
import type { ListReportMutant } from '../../types/list-report-mutant'
import type { ListReport } from '../../types/list-report'

import { formatTextReport } from '../../cli/format-text-report'

/**
 * Creates a pending mutant at the start of `example.ts`.
 *
 * @param overrides - Fields that differ from the default mutant.
 * @returns Mutant as the report holds it.
 */
function createMutant(overrides: Partial<ListReportMutant>): ListReportMutant {
  return {
    description: 'Empties a string literal.',
    sourceLine: "let unit = 'cm'",
    mutator: 'string-literal',
    id: '000000000001',
    kind: 'expression',
    file: 'example.ts',
    status: 'Pending',
    replacement: "''",
    original: "'cm'",
    ignoredBy: null,
    endColumn: 16,
    reason: null,
    scope: null,
    column: 12,
    endLine: 1,
    start: 11,
    line: 1,
    end: 15,
    ...overrides,
  }
}

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
 * Creates a report of the given mutants. Only the fields the text format reads
 * are filled.
 *
 * @param mutants - Mutants to list, already in canonical order.
 * @param summary - Counts that differ from one pending mutant in one file.
 * @returns Report with empty diagnostics, files and mutators.
 */
function createReport(
  mutants: ListReportMutant[],
  summary: Partial<ListReportSummary> = {},
): ListReport {
  return {
    summary: {
      totalWarnings: 0,
      totalMutants: 1,
      totalPending: 1,
      totalIgnored: 0,
      totalErrors: 0,
      totalFiles: 1,
      ...summary,
    },
    preset: 'recommended',
    schemaVersion: 1,
    command: 'list',
    diagnostics: [],
    mutators: [],
    files: [],
    mutants,
  }
}

describe('formatTextReport', () => {
  it('prints aligned lines and the summary', () => {
    let ignored = { file: 'src/cart.ts', status: 'Ignored' } as const
    let pending = { file: 'src/cart.ts' }
    let legacy = {
      ...ignored,
      reason: 'legacy formatting, covered elsewhere',
      line: 18,
    }
    let mutants = [
      createMutant({
        ...pending,
        original: "emit('add', label?.trim())",
        mutator: 'statement-removal',
        // spell-checker: disable-next-line
        id: 'tymhtfmk7wf5',
        replacement: ';',
        column: 5,
        line: 6,
      }),
      createMutant({
        ...ignored,
        reason: 'event name',
        // spell-checker: disable-next-line
        id: 'w7019f5axk5g',
        original: "'add'",
        column: 10,
        line: 6,
      }),
      createMutant({
        ...pending,
        mutator: 'optional-chaining',
        replacement: 'label.trim()',
        original: 'label?.trim()',
        // spell-checker: disable-next-line
        id: 'jkpx0bx1hbwj',
        column: 17,
        line: 6,
      }),
      createMutant({
        ...pending,
        original: 'this.items.push(price)',
        mutator: 'statement-removal',
        // spell-checker: disable-next-line
        id: 'twr1h5gd5w42',
        replacement: ';',
        column: 5,
        line: 7,
      }),
      createMutant({
        ...pending,
        mutator: 'statement-removal',
        original: 'notify()',
        // spell-checker: disable-next-line
        id: 'gfkwqsq7yvfd',
        replacement: ';',
        column: 5,
        line: 8,
      }),
      createMutant({
        ...pending,
        mutator: 'arithmetic-operator',
        replacement: 'acc - item',
        original: 'acc + item',
        // spell-checker: disable-next-line
        id: '3nsqarb4qvhm',
        column: 48,
        line: 12,
      }),
      createMutant({
        ...pending,
        mutator: 'comparison-operator',
        replacement: 'sum >= 100',
        original: 'sum > 100',
        id: 'gf7s9ez5kts4',
        column: 12,
        line: 13,
      }),
      createMutant({
        ...pending,
        mutator: 'comparison-operator',
        original: 'sum > 100',
        replacement: 'false',
        // spell-checker: disable-next-line
        id: 'acynpqjdm30h',
        column: 12,
        line: 13,
      }),
      createMutant({
        ...pending,
        mutator: 'arithmetic-operator',
        replacement: 'sum / rate',
        original: 'sum * rate',
        // spell-checker: disable-next-line
        id: 'vzjmjad49zs4',
        column: 24,
        line: 13,
      }),
      createMutant({
        ...legacy,
        mutator: 'comparison-operator',
        replacement: 'count <= 2',
        original: 'count < 2',
        // spell-checker: disable-next-line
        id: 'v7skpar6108w',
        column: 48,
      }),
      createMutant({
        ...legacy,
        mutator: 'comparison-operator',
        original: 'count < 2',
        replacement: 'false',
        // spell-checker: disable-next-line
        id: 'pq44a3xxdefh',
        column: 48,
      }),
      createMutant({
        ...legacy,
        // spell-checker: disable-next-line
        id: '0swkcdtty456',
        original: "'item'",
        column: 60,
      }),
      createMutant({
        ...legacy,
        original: "'items'",
        id: 'tj6he114jb6k',
        column: 69,
      }),
      createMutant({
        ...pending,
        // spell-checker: disable-next-line
        id: 'j5y7xqje89xp',
        original: "'cm'",
        column: 19,
        line: 23,
      }),
    ]

    let text = formatTextReport(
      createReport(mutants, {
        totalWarnings: 2,
        totalMutants: 14,
        totalPending: 9,
        totalIgnored: 5,
      }),
    )

    expect(text).toBe(
      [
        // spell-checker: disable-next-line
        "src/cart.ts:6:5    tymhtfmk7wf5  statement-removal    emit('add', label?.trim()) -> ;",
        "src/cart.ts:6:10   w7019f5axk5g  string-literal       'add' -> '' (ignored: event name)",
        // spell-checker: disable-next-line
        'src/cart.ts:6:17   jkpx0bx1hbwj  optional-chaining    label?.trim() -> label.trim()',
        'src/cart.ts:7:5    twr1h5gd5w42  statement-removal    this.items.push(price) -> ;',
        // spell-checker: disable-next-line
        'src/cart.ts:8:5    gfkwqsq7yvfd  statement-removal    notify() -> ;',
        // spell-checker: disable-next-line
        'src/cart.ts:12:48  3nsqarb4qvhm  arithmetic-operator  acc + item -> acc - item',
        'src/cart.ts:13:12  gf7s9ez5kts4  comparison-operator  sum > 100 -> sum >= 100',
        // spell-checker: disable-next-line
        'src/cart.ts:13:12  acynpqjdm30h  comparison-operator  sum > 100 -> false',
        // spell-checker: disable-next-line
        'src/cart.ts:13:24  vzjmjad49zs4  arithmetic-operator  sum * rate -> sum / rate',
        // spell-checker: disable-next-line
        'src/cart.ts:18:48  v7skpar6108w  comparison-operator  count < 2 -> count <= 2 (ignored: legacy formatting, covered elsewhere)',
        // spell-checker: disable-next-line
        'src/cart.ts:18:48  pq44a3xxdefh  comparison-operator  count < 2 -> false (ignored: legacy formatting, covered elsewhere)',
        // spell-checker: disable-next-line
        "src/cart.ts:18:60  0swkcdtty456  string-literal       'item' -> '' (ignored: legacy formatting, covered elsewhere)",
        "src/cart.ts:18:69  tj6he114jb6k  string-literal       'items' -> '' (ignored: legacy formatting, covered elsewhere)",
        // spell-checker: disable-next-line
        "src/cart.ts:23:19  j5y7xqje89xp  string-literal       'cm' -> ''",
        '',
        '14 mutants in 1 file: 9 pending, 5 ignored, 2 warnings (preset: recommended)',
      ].join('\n'),
    )
  })

  it.each([
    { given: 'a short text', original: 'a + b', shown: 'a + b' },
    {
      original: '\n  first +\n\t  second  ',
      given: 'whitespace runs',
      shown: 'first + second',
    },
    { given: 'an empty text', shown: '(empty)', original: '' },
    { given: 'whitespace only', shown: '(empty)', original: ' \n ' },
    {
      given: 'a text of 60 characters',
      original: 'x'.repeat(60),
      shown: 'x'.repeat(60),
    },
    {
      given: 'a text of 61 characters',
      shown: `${'x'.repeat(57)}...`,
      original: 'x'.repeat(61),
    },
    {
      original: `${'x'.repeat(56)}\u{1F600}${'y'.repeat(10)}`,
      given: 'an astral character across the cut',
      shown: `${'x'.repeat(56)}...`,
    },
    {
      original: `${'x'.repeat(55)}\u{1F600}${'y'.repeat(10)}`,
      given: 'an astral character before the cut',
      shown: `${'x'.repeat(55)}\u{1F600}...`,
    },
  ])('shortens $given', ({ original, shown }) => {
    let text = formatTextReport(
      createReport([createMutant({ replacement: original, original })]),
    )

    expect(text.split('\n', 1)[0]).toBe(
      `example.ts:1:12  000000000001  string-literal  ${shown} -> ${shown}`,
    )
  })

  it('prints only the summary without mutants', () => {
    let text = formatTextReport(
      createReport([], { totalPending: 0, totalMutants: 0, totalFiles: 2 }),
    )

    expect(text).toBe(
      '0 mutants in 2 files: 0 pending, 0 ignored (preset: recommended)',
    )
  })

  it.each([
    {
      expected:
        '1 mutant in 1 file: 1 pending, 0 ignored, 1 error, 1 warning (preset: recommended)',
      summary: { totalWarnings: 1, totalErrors: 1 },
      given: 'singular counts',
    },
    {
      expected:
        '1 mutant in 1 file: 1 pending, 0 ignored, 2 errors, 3 warnings (preset: recommended)',
      summary: { totalWarnings: 3, totalErrors: 2 },
      given: 'plural counts',
    },
    {
      expected:
        '1 mutant in 1 file: 1 pending, 0 ignored, 1 error (preset: recommended)',
      given: 'errors without warnings',
      summary: { totalErrors: 1 },
    },
  ])('names errors and warnings for $given', ({ expected, summary }) => {
    let text = formatTextReport(createReport([createMutant({})], summary))

    expect(text.split('\n').at(-1)).toBe(expected)
  })

  it('prints the skipped section after the mutants with counts by category', () => {
    let report = createReport([createMutant({})], {
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

    expect(formatTextReport(report)).toBe(
      [
        "example.ts:1:12  000000000001  string-literal  'cm' -> ''",
        '',
        'Skipped:',
        'example.ts:1:5       comparison-operator  a === null -> false (skipped: equivalent proven-comparison: the type hints prove the comparison is always false)',
        'src/example.ts:12:5  condition            ready -> true (skipped: owned O3: logical-operator owns the truth value of a boolean-mode operand)',
        '',
        '1 mutant in 1 file: 1 pending, 0 ignored (preset: recommended)',
        '2 skipped: 1 equivalent, 1 owned',
      ].join('\n'),
    )
  })

  it('prints only the summaries when nothing is listed or skipped', () => {
    let report = createReport([], {
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

    expect(formatTextReport(report)).toBe(
      [
        '0 mutants in 1 file: 0 pending, 0 ignored (preset: recommended)',
        '0 skipped',
      ].join('\n'),
    )
  })
})
