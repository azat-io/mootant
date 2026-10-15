import { describe, expect, it } from 'vitest'

import type { RunReport } from '../../types/report/run-report'

import { formatRunTextReport } from '../../cli/format-run-text-report'
import { createRunResult } from '../helpers/create-run-result'
import { buildRunReport } from '../../cli/build-run-report'

/**
 * Gets the summary lines of a formatted report.
 *
 * @param report - Report to format.
 * @returns Lines after the last empty line.
 */
function formatSummary(report: RunReport): string[] {
  return formatRunTextReport(report).split('\n\n').at(-1)!.split('\n')
}

/**
 * Builds the report of the shared run result.
 *
 * @returns Report with a mutant of every status.
 */
function createReport(): RunReport {
  return buildRunReport(createRunResult())
}

describe('formatRunTextReport', () => {
  it('lists the mutants to act on, then the summary', () => {
    expect(formatRunTextReport(createReport())).toBe(
      [
        'src/cart.ts:4:10  survived0001  Survived    comparison-operator  size < limit -> size <= limit',
        '                  covered by fits > small sizes (test/cart.test.ts:12) and 1 more',
        'src/cart.ts:4:10  errored00001  Error       conditional          size < limit -> true',
        '                  Tries of test/cart.test.ts went missing twice.',
        'src/cart.ts:6:20  uncovered001  NoCoverage  arithmetic-operator  2 * 3 -> 2 / 3',
        '',
        '6 mutants in 1 file: 1 killed, 1 timeout, 1 survived, 1 no coverage, 1 ignored, 1 without verdict, 1 warning (preset: recommended, runner: vitest, mode: fast)',
        'Mutation score: 50% (covered 66.67%)',
        'Fast mode: 1 kill or timeout comes from batch tries and may be false; run without --fast to confirm.',
        'Time: 1.3 s (start 0.2 s, dry run 0.2 s, batch 0.2 s for 3 mutants, isolated 0.7 s for 3 mutants)',
        'Runs: 1 dry, 2 batch, 2 isolated',
        'Static cost: src/cart.ts 0.6 s (1 static mutant, 2 units)',
      ].join('\n'),
    )
  })

  it('prints only the summary when no mutant needs action', () => {
    let report = createReport()
    report.mutants = report.mutants.filter(mutant => mutant.status === 'Killed')

    expect(formatRunTextReport(report)).not.toContain('\n\n')
  })

  it('names a single covering test without a line, and no reason', () => {
    let report = createReport()
    report.mutants[2]!.coveredBy = ['cart-unit']
    report.tests[0]!.line = null
    report.mutants[3]!.message = null

    expect(formatRunTextReport(report).split('\n').slice(0, 3)).toStrictEqual([
      'src/cart.ts:4:10  survived0001  Survived    comparison-operator  size < limit -> size <= limit',
      '                  covered by cart > unit (test/cart.test.ts)',
      'src/cart.ts:4:10  errored00001  Error       conditional          size < limit -> true',
    ])
  })

  it('prints no covering line for a survivor reached only at load', () => {
    let report = createReport()
    report.mutants[2]!.coveredBy = []

    expect(formatRunTextReport(report).split('\n', 2)[1]).toMatch(/^src/u)
  })

  it('names error diagnostics and leaves out empty counts', () => {
    let report = createReport()
    report.summary.totalErrorMutants = 0
    report.summary.totalWarnings = 0
    report.summary.totalErrors = 2

    expect(formatSummary(report)[0]).toBe(
      '6 mutants in 1 file: 1 killed, 1 timeout, 1 survived, 1 no coverage, 1 ignored, 2 errors (preset: recommended, runner: vitest, mode: fast)',
    )
  })

  it.each([
    {
      expected: 'Mutation score: 50% (covered 66.67%), threshold 50%: passed',
      threshold: 50,
    },
    {
      expected: 'Mutation score: 50% (covered 66.67%), threshold 70%: failed',
      threshold: 70,
    },
  ])('checks the threshold $threshold', ({ threshold, expected }) => {
    let report = createReport()
    report.summary.threshold = threshold

    expect(formatSummary(report)[1]).toBe(expected)
  })

  it('names scores without mutants to score', () => {
    let report = createReport()
    report.summary.coveredScore = null
    report.summary.score = null

    expect(formatSummary(report)[1]).toBe(
      'Mutation score: none (no mutants to score)',
    )
  })

  it('names a covered score without covered mutants', () => {
    let report = createReport()
    report.summary.coveredScore = null
    report.summary.score = 0

    expect(formatSummary(report)[1]).toBe('Mutation score: 0% (covered none)')
  })

  it('orders run kinds by phase', () => {
    let report = createReport()
    report.summary.runs = {
      confirmation: 1,
      isolated: 2,
      recovery: 1,
      batch: 2,
      dry: 1,
    }

    expect(formatSummary(report)[4]).toBe(
      'Runs: 1 dry, 2 batch, 1 recovery, 1 confirmation, 2 isolated',
    )
  })

  it('prints no runs when nothing ran', () => {
    let report = createReport()
    report.summary.runs = {}

    expect(formatSummary(report)[4]).toBe('Runs: none')
  })

  it('names the three most expensive modules', () => {
    let report = createReport()
    report.summary.staticCost = ['a', 'b', 'c', 'd'].map(name => ({
      file: `src/${name}.ts`,
      duration: 1500,
      mutants: 2,
      units: 1,
    }))

    expect(formatSummary(report)[5]).toBe(
      'Static cost: src/a.ts 1.5 s (2 static mutants, 1 unit), src/b.ts 1.5 s (2 static mutants, 1 unit), src/c.ts 1.5 s (2 static mutants, 1 unit)',
    )
  })

  it.each([
    { given: 'a quarter of the time', isolated: 325, costs: 1 },
    { given: 'no module cost', isolated: 700, costs: 0 },
  ])('leaves out the static cost with $given', ({ isolated, costs }) => {
    let report = createReport()
    report.summary.duration.isolated = isolated
    report.summary.staticCost = report.summary.staticCost.slice(0, costs)

    expect(formatSummary(report)).toHaveLength(5)
  })

  it('counts several batch verdicts in fast mode', () => {
    let report = createReport()
    report.summary.totalBatch = 3

    expect(formatSummary(report)[2]).toBe(
      'Fast mode: 3 kills and timeouts come from batch tries and may be false; run without --fast to confirm.',
    )
  })

  it('leaves out the batch phase and its note in the default mode', () => {
    let report = createReport()
    report.mode = 'isolated'
    report.summary.totalBatch = null
    report.summary.duration.batch = null

    expect(formatSummary(report).slice(0, 3)).toStrictEqual([
      '6 mutants in 1 file: 1 killed, 1 timeout, 1 survived, 1 no coverage, 1 ignored, 1 without verdict, 1 warning (preset: recommended, runner: vitest, mode: isolated)',
      'Mutation score: 50% (covered 66.67%)',
      'Time: 1.3 s (start 0.2 s, dry run 0.2 s, isolated 0.7 s for 3 mutants)',
    ])
  })
})
