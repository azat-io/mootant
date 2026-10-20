// spell-checker:ignore erro othe
import { describe, expect, it } from 'vitest'

import type { RunReport } from '../../../types/report/run-report'

import { formatRunTextReport } from '../../../cli/report/format-run-text-report'
import { getShortIdLength } from '../../../cli/report/get-short-id-length'
import { getDisplayWidth } from '../../../cli/terminal/get-display-width'
import { buildRunReport } from '../../../cli/report/build-run-report'
import { createTextStyle } from '../../helpers/create-text-style'
import { createRunResult } from '../../helpers/create-run-result'
import { showEscapes } from '../../helpers/show-escapes'

/**
 * Formats a run report as `mootant run src`.
 *
 * @param report - Report to format.
 * @param options - Style settings that differ, and verbosity.
 * @param options.verbose - Whether to add covering tests and runs.
 * @returns Text of the report.
 */
function format(
  report: RunReport,
  options: Parameters<typeof createTextStyle>[0] & { verbose?: boolean } = {},
): string {
  let { verbose = false, ...style } = options
  return formatRunTextReport(report, {
    idLength: getShortIdLength(report.mutants.map(mutant => mutant.id)),
    style: createTextStyle(style),
    command: 'mootant run src',
    recheck: 'mootant run src',
    verbose,
  })
}

/**
 * Gets the lines of one mutant of a formatted report: its heading, diff and
 * details.
 *
 * @param text - Formatted report.
 * @param id - Short id the heading ends with.
 * @returns Lines up to the next empty line, joined with line breaks.
 */
function getSection(text: string, id: string): string {
  let lines = text.split('\n')
  let start = lines.findIndex(line => line.endsWith(`  ${id}`))
  let end = lines.indexOf('', start)
  return lines.slice(start, end).join('\n')
}

/**
 * Gets the value of a field of a formatted report.
 *
 * @param text - Formatted report.
 * @param label - Gray name before the value, such as `score`.
 * @returns Text after the label column, or undefined without the field.
 */
function getField(text: string, label: string): undefined | string {
  return text
    .split('\n')
    .find(line => line.startsWith(`${label}  `))
    ?.slice(16)
}

/**
 * Builds the report of the shared run result.
 *
 * @returns Report with a mutant of every status.
 */
function createReport(): RunReport {
  return buildRunReport(createRunResult(), {
    recheck: 'mootant run src',
    all: true,
  })
}

describe('formatRunTextReport', () => {
  it('prints the header, the work, the counts, the mutants to act on and a hint', () => {
    expect(format(createReport())).toMatchInlineSnapshot(`
      "● mootant run src                                                            vitest 5.0.4

      dry run         3 tests in 0.2s
      mutants         6 in 1 file, 1 ignored
      time            1.3s in fast mode (start 0.2s, dry run 0.2s, batch 0.2s, isolated 0.7s)

      killed          1
      survived        1
      timeout         1
      no coverage     1
      error           1
      score           50% (covered 66.67%)
      1 kill or timeout comes from batch tries and may be false; run without --fast to confirm.

      survived 1

      src/cart.ts
        4:10  comparison-operator  surv
          - return size < limit
          + return size <= limit
          test: test/cart.test.ts

      no coverage 1

      src/cart.ts
        6:20  arithmetic-operator  unco
          - export let ratio = 2 * 3
          + export let ratio = 2 / 3

      errors 1

      src/cart.ts
        4:10  conditional  erro
          - return size < limit
          + return true
          Tries of test/cart.test.ts went missing twice.

      re-check one: mootant run src --mutant surv"
    `)
  })

  it('colors the counts, statuses and the score', () => {
    let report = createReport()
    report.summary.threshold = 50

    expect(showEscapes(format(report, { colors: true })))
      .toMatchInlineSnapshot(`
        "<92>●<39> <1>mootant run src<22>                                                            <90>vitest 5.0.4<39>

        <90>dry run         <39>3 tests in 0.2s
        <90>mutants         <39>6 in 1 file, 1 ignored
        <90>time            <39>1.3s in fast mode (start 0.2s, dry run 0.2s, batch 0.2s, isolated 0.7s)

        <90>killed          <39>1
        <90>survived        <39><92>1<39>
        <90>timeout         <39>1
        <90>no coverage     <39>1
        <90>error           <39><31>1<39>
        <90>score           <39><1>50%<22> <90>(covered 66.67%)<39>  <32>✔ threshold 50%<39>
        <90>1 kill or timeout comes from batch tries and may be false; run without --fast to confirm.<39>

        <1><92>survived<39><22> 1

        <1>src/cart.ts<22>
          <90>4:10<39>  <90>comparison-operator<39>  surv
            <31>-<39> return size <31><<39> limit
            <32>+<39> return size <32><=<39> limit
            <90>test: test/cart.test.ts<39>

        <1><33>no coverage<39><22> 1

        <1>src/cart.ts<22>
          <90>6:20<39>  <90>arithmetic-operator<39>  unco
            <31>-<39> export let ratio = 2 <31>*<39> 3
            <32>+<39> export let ratio = 2 <32>/<39> 3

        <1><31>errors<39><22> 1

        <1>src/cart.ts<22>
          <90>4:10<39>  <90>conditional<39>  erro
            <31>-<39> return <31>size < limit<39>
            <32>+<39> return <32>true<39>
            <90>Tries of test/cart.test.ts went missing twice.<39>

        <90>re-check one:<39> mootant run src --mutant surv"
      `)
  })

  it('adds covering tests and runs when verbose, in ASCII', () => {
    let report = createReport()
    report.summary.runs = {
      confirmation: 1,
      isolated: 2,
      recovery: 1,
      batch: 2,
      dry: 1,
    }

    expect(format(report, { unicode: false, verbose: true }))
      .toMatchInlineSnapshot(`
        "* mootant run src                                                            vitest 5.0.4

        dry run         3 tests in 0.2s
        mutants         6 in 1 file, 1 ignored
        time            1.3s in fast mode (start 0.2s, dry run 0.2s, batch 0.2s, isolated 0.7s)
        runs            1 dry, 2 batch, 1 recovery, 1 confirmation, 2 isolated

        killed          1
        survived        1
        timeout         1
        no coverage     1
        error           1
        score           50% (covered 66.67%)
        1 kill or timeout comes from batch tries and may be false; run without --fast to confirm.

        survived 1

        src/cart.ts
          4:10  comparison-operator  surv
            - return size < limit
            + return size <= limit
            test: test/cart.test.ts
            covered by fits > small sizes (test/cart.test.ts:12) and 1 more

        no coverage 1

        src/cart.ts
          6:20  arithmetic-operator  unco
            - export let ratio = 2 * 3
            + export let ratio = 2 / 3

        errors 1

        src/cart.ts
          4:10  conditional  erro
            - return size < limit
            + return true
            Tries of test/cart.test.ts went missing twice.

        re-check one: mootant run src --mutant surv"
      `)
  })

  it('cuts reasons to a narrow terminal', () => {
    let report = createReport()
    report.mutants[3]!.message = 'x'.repeat(80)

    expect(format(report, { width: 40 }).split('\n').slice(-4))
      .toMatchInlineSnapshot(`
        [
          "    + return true",
          "    xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx…",
          "",
          "re-check one: mootant run src --mutant surv",
        ]
      `)
  })

  it('cuts a long line around the change, both sides at the same columns', () => {
    let report = createReport()
    Object.assign(report.mutants[2]!, {
      before: [
        `  if (${'value.'.repeat(12)}size < limit && ${'other.'.repeat(8)}ok) {`,
      ],
      after: [
        `  if (${'value.'.repeat(12)}size <= limit && ${'other.'.repeat(8)}ok) {`,
      ],
      cutStart: 0,
      cutEnd: 0,
    })
    report.mutants[2]!.column = 79
    report.mutants[2]!.endColumn = 91

    expect(getSection(format(report, { width: 60 }), 'surv'))
      .toMatchInlineSnapshot(`
        "  4:79  comparison-operator  surv
            - ….value.value.value.size < limit && other.other.other…
            + ….value.value.value.size <= limit && other.other.othe…
            test: test/cart.test.ts"
      `)
    expect(getSection(format(report, { unicode: false, width: 60 }), 'surv'))
      .toMatchInlineSnapshot(`
        "  4:79  comparison-operator  surv
            - ...value.value.value.size < limit && other.other.ot...
            + ...value.value.value.size <= limit && other.other.o...
            test: test/cart.test.ts"
      `)
    expect(getSection(format(report, { width: 200 }), 'surv'))
      .toMatchInlineSnapshot(`
        "  4:79  comparison-operator  surv
            - if (value.value.value.value.value.value.value.value.value.value.value.value.size < limit && other.other.other.other.other.other.other.other.ok) {
            + if (value.value.value.value.value.value.value.value.value.value.value.value.size <= limit && other.other.other.other.other.other.other.other.ok) {
            test: test/cart.test.ts"
      `)
  })

  it('starts a change too wide for the line a few columns before it', () => {
    let report = createReport()
    Object.assign(report.mutants[2]!, {
      before: [`call(first, ${'a'.repeat(70)})`],
      after: [`call(first, ${'b'.repeat(70)})`],
      cutStart: 0,
      cutEnd: 0,
    })
    report.mutants[2]!.column = 13
    report.mutants[2]!.endColumn = 83

    expect(getSection(format(report, { width: 40 }), 'surv'))
      .toMatchInlineSnapshot(`
        "  4:13  comparison-operator  surv
            - …, aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa…
            + …, bbbbbbbbbbbbbbbbbbbbbbbbbbbbbb…
            test: test/cart.test.ts"
      `)
  })

  it('shows the first and last lines of a long multi-line change', () => {
    let report = createReport()
    Object.assign(report.mutants[2]!, {
      before: [
        '    if (ready) {',
        '      start()',
        '      wait()',
        '      check()',
        '      finish()',
        '    }',
      ],
      after: ['    ;'],
      cutStart: 0,
      cutEnd: 0,
    })
    report.mutants[2]!.column = 5
    report.mutants[2]!.endColumn = 6

    expect(getSection(format(report), 'surv')).toMatchInlineSnapshot(`
      "  4:5  comparison-operator  surv
          - if (ready) {
          -   start()
          - … 3 lines
          - }
          + ;
          test: test/cart.test.ts"
    `)
  })

  it('keeps short multi-line changes whole and trims their indentation', () => {
    let report = createReport()
    Object.assign(report.mutants[2]!, {
      before: ['\t\tlet total =', '\t\t\tfirst + second'],
      after: ['\t\tlet total =', '\t\t\tfirst - second'],
      cutStart: 0,
      cutEnd: 0,
    })
    report.mutants[2]!.column = 7
    report.mutants[2]!.endColumn = 18

    expect(getSection(format(report), 'surv')).toMatchInlineSnapshot(`
      "  4:7  comparison-operator  surv
          - let total =
          -   first + second
          + let total =
          +   first - second
          test: test/cart.test.ts"
    `)
  })

  it('keeps every line within a narrow terminal, with wide characters', () => {
    let report = createReport()
    report.mutants[2]!.file = `src/${'deep/'.repeat(12)}cart.ts`
    report.mutants[2]!.mutator = 'acme/a-very-long-mutator-name-of-a-plugin'
    Object.assign(report.mutants[2]!, {
      before: [`let label = '${'大きい数字です'.repeat(4)}' + suffix`],
      after: ["let label = '' + suffix"],
      cutStart: 0,
      cutEnd: 0,
    })
    report.mutants[2]!.column = 14
    report.mutants[2]!.endColumn = 42
    report.summary.staticCost = []

    let lines = format(report, { width: 40 }).split('\n').slice(0, -1)

    expect(lines.filter(line => getDisplayWidth(line) > 40)).toStrictEqual([])
    expect(getSection(format(report, { width: 40 }), 'surv'))
      .toMatchInlineSnapshot(`
        "  4:14  acme/a-very-long-mutator-…  surv
            - … = '大きい数字です大きい数字です…
            + … = '' + suffix
            test: test/cart.test.ts"
      `)
  })

  it('suggests to re-check the first survivor, else the first listed mutant', () => {
    let report = createReport()
    report.mutants[2]!.line = 9

    expect(format(report).split('\n').at(-1)).toBe(
      're-check one: mootant run src --mutant surv',
    )

    report.mutants = report.mutants.filter(
      mutant => mutant.status !== 'Survived',
    )

    expect(format(report).split('\n').at(-1)).toBe(
      're-check one: mootant run src --mutant erro',
    )
  })

  it('names a single covering test without a line, and no reason', () => {
    let report = createReport()
    report.mutants[2]!.test = {
      file: 'test/cart.test.ts',
      name: 'cart > unit',
      line: null,
    }
    report.mutants[2]!.tests = 1
    report.mutants[3]!.message = null

    let text = format(report, { verbose: true })

    expect(getSection(text, 'surv')).toContain(
      '\n    covered by cart > unit (test/cart.test.ts)',
    )
    expect(getSection(text, 'erro')).toBe(
      [
        '  4:10  conditional  erro',
        '    - return size < limit',
        '    + return true',
      ].join('\n'),
    )
  })

  it('names the test file but no covering test of a survivor reached only at load', () => {
    let report = createReport()
    report.mutants[2]!.testFiles = { 'test/other.test.ts': 0 }
    report.mutants[2]!.coveredBy = []
    report.mutants[2]!.test = null
    report.mutants[2]!.tests = 0

    let section = getSection(format(report, { verbose: true }), 'surv')

    expect(section).toContain('\n    test: test/other.test.ts')
    expect(section).not.toContain('covered by')
  })

  it('names the test file to extend of a mutant without coverage', () => {
    let report = createReport()
    report.mutants[4]!.testFiles = { 'test/cart.test.ts': 0 }

    expect(getSection(format(report), 'unco')).toBe(
      [
        '  6:20  arithmetic-operator  unco',
        '    - export let ratio = 2 * 3',
        '    + export let ratio = 2 / 3',
        '    test: test/cart.test.ts',
      ].join('\n'),
    )
  })

  it('keeps the end of a long test file path in a narrow terminal', () => {
    let report = createReport()
    let file =
      'test/features/billing/invoices/calculations/compute-invoice-total.test.ts'
    report.mutants[4]!.testFiles = { [file]: 0 }

    expect(
      getSection(format(report, { width: 40 }), 'unco')
        .split('\n')
        .at(-1),
    ).toBe(`    test: …${file.slice(-29)}`)
  })

  it('names no test file of a mutant without one', () => {
    let report = createReport()
    report.mutants[2]!.testFiles = {}

    expect(getSection(format(report), 'surv')).not.toContain('test:')
  })

  it('prints neither the list nor the hint when no mutant needs action', () => {
    let report = createReport()
    report.mutants = report.mutants.filter(mutant => mutant.status === 'Killed')
    report.summary.totalBatch = 0

    let text = format(report)

    expect(text).not.toContain('re-check')
    expect(text.split('\n').at(-1)).toMatch(/^score/u)
  })

  it.each([
    { expected: '50% (covered 66.67%)  ✔ threshold 50%', threshold: 50 },
    {
      expected: '50% (covered 66.67%)  ✖ below threshold 70%',
      threshold: 70,
    },
  ])('checks the threshold $threshold', ({ threshold, expected }) => {
    let report = createReport()
    report.summary.threshold = threshold

    expect(getField(format(report), 'score')).toBe(expected)
  })

  it('names scores without mutants to score', () => {
    let report = createReport()
    report.summary.coveredScore = null
    report.summary.score = null

    expect(getField(format(report), 'score')).toBe('none (no mutants to score)')
  })

  it('names a covered score without covered mutants', () => {
    let report = createReport()
    report.summary.coveredScore = null
    report.summary.score = 0

    expect(getField(format(report), 'score')).toBe('0% (covered none)')
  })

  it('leaves out errors and ignored mutants when there are none', () => {
    let report = createReport()
    report.summary.totalErrorMutants = 0
    report.summary.totalIgnored = 0
    let text = format(report)

    expect(getField(text, 'error')).toBeUndefined()
    expect(getField(text, 'mutants')).toBe('6 in 1 file')
  })

  it('counts the verdicts that came from the cache after the ignored ones', () => {
    let report = createReport()
    report.summary.totalCached = 4

    expect(getField(format(report), 'mutants')).toBe(
      '6 in 1 file, 1 ignored, 4 cached',
    )

    report.summary.totalCached = 0

    expect(getField(format(report), 'mutants')).toBe('6 in 1 file, 1 ignored')
  })

  it('prints no runs when nothing ran', () => {
    let report = createReport()
    report.summary.runs = {}

    expect(getField(format(report, { verbose: true }), 'runs')).toBe('none')
  })

  it('names the modules with the largest share of test time in a long run', () => {
    let report = createReport()
    report.summary.duration.total = 60_000
    report.summary.duration.isolated = 40_000
    report.summary.staticCost = [3000, 1500, 1000, 500].map(
      (duration, index) => ({
        file: `src/${index}.ts`,
        mutants: 2,
        units: 1,
        duration,
      }),
    )

    expect(getField(format(report), 'most test time')).toBe(
      'src/0.ts 50%, src/1.ts 25%, src/2.ts 17%',
    )
  })

  it('shares no test time without any', () => {
    let report = createReport()
    report.summary.duration.total = 60_000
    report.summary.duration.isolated = 40_000
    report.summary.staticCost = [
      { file: 'src/a.ts', duration: 0, mutants: 1, units: 1 },
    ]

    expect(getField(format(report), 'most test time')).toBe('src/a.ts 0%')
  })

  it.each([
    { given: 'a short run', isolated: 700, total: 1300, costs: 1 },
    { given: 'a quarter of the time', isolated: 7500, total: 30_000, costs: 1 },
    { given: 'no module cost', isolated: 40_000, total: 60_000, costs: 0 },
  ])(
    'leaves out the most test time with $given',
    ({ isolated, costs, total }) => {
      let report = createReport()
      report.summary.duration.isolated = isolated
      report.summary.duration.total = total
      report.summary.staticCost = report.summary.staticCost.slice(0, costs)

      expect(getField(format(report), 'most test time')).toBeUndefined()
    },
  )

  it('counts several batch verdicts in fast mode', () => {
    let report = createReport()
    report.summary.totalBatch = 3

    expect(format(report)).toContain(
      '\n3 kills and timeouts come from batch tries and may be false; run without --fast to confirm.\n',
    )
  })

  it('wraps the note about batch verdicts to a narrow terminal', () => {
    expect(format(createReport(), { width: 40 })).toContain(
      '\n1 kill or timeout comes from batch tries\nand may be false; run without --fast to\nconfirm.\n',
    )
  })

  it('leaves out the batch phase and its note in the default mode', () => {
    let report = createReport()
    report.mode = 'isolated'
    report.summary.totalBatch = null
    report.summary.duration.batch = null
    let text = format(report)

    expect(getField(text, 'time')).toBe(
      '1.3s (start 0.2s, dry run 0.2s, isolated 0.7s)',
    )
    expect(text).not.toContain('batch')
  })

  it('names the test runner without a version', () => {
    let report = createReport()
    report.runnerVersion = null

    expect(format(report).split('\n', 1)[0]).toMatch(/ {2}vitest$/u)
  })

  it('marks the focus of a mutant that the replacement applies as it is', () => {
    let report = createReport()
    Object.assign(report.mutants[2]!, {
      before: ['  return /^a+b$/u.test(size)'],
      after: ['  return /^a+b/u.test(size)'],
      cutStart: 0,
      cutEnd: 0,
    })
    report.mutants[2]!.column = 10
    report.mutants[2]!.endColumn = 18
    report.mutants[2]!.focus = {
      replacement: '',
      original: '$',
      column: 15,
      start: 60,
      line: 4,
      end: 61,
    }

    expect(showEscapes(getSection(format(report, { colors: true }), 'surv')))
      .toMatchInlineSnapshot(`
        "  <90>4:15<39>  <90>comparison-operator<39>  surv
            <31>-<39> return /^a+b<31>$<39>/u.test(size)
            <32>+<39> return /^a+b/u.test(size)
            <90>test: test/cart.test.ts<39>"
      `)
  })

  it('marks the changed words of a focus the replacement does not apply as it is', () => {
    let report = createReport()
    Object.assign(report.mutants[2]!, {
      before: ["  return new RegExp('x[0-9]')"],
      after: ["  return new RegExp('x[^]')"],
      cutStart: 0,
      cutEnd: 0,
    })
    report.mutants[2]!.column = 22
    report.mutants[2]!.endColumn = 31
    report.mutants[2]!.focus = {
      replacement: '[^0-9]',
      original: '[0-9]',
      column: 24,
      start: 60,
      line: 4,
      end: 65,
    }

    expect(showEscapes(getSection(format(report, { colors: true }), 'surv')))
      .toMatchInlineSnapshot(`
        "  <90>4:24<39>  <90>comparison-operator<39>  surv
            <31>-<39> return new RegExp('x[<31>0-9<39>]')
            <32>+<39> return new RegExp('x[<32>^<39>]')
            <90>test: test/cart.test.ts<39>"
      `)
  })
})
