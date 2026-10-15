import { describe, expect, it } from 'vitest'

import { createRunResult } from '../helpers/create-run-result'
import { buildRunReport } from '../../cli/build-run-report'

describe('buildRunReport', () => {
  it('adds the verdicts to the list entries of the mutants', () => {
    let report = buildRunReport(createRunResult())

    expect(
      report.mutants.map(mutant => [mutant.id, mutant.status]),
    ).toStrictEqual([
      ['killed000001', 'Killed'],
      ['timeout00001', 'Timeout'],
      ['survived0001', 'Survived'],
      ['errored00001', 'Error'],
      ['uncovered001', 'NoCoverage'],
      ['ignored00001', 'Ignored'],
    ])
    expect(report.mutants[0]).toStrictEqual({
      description: 'Empties a string literal.',
      sourceLine: "export let unit = 'cm'",
      message: "expected '' to be 'cm'",
      killedIn: 'test/cart.test.ts',
      mutator: 'string-literal',
      coveredBy: ['cart-unit'],
      killedBy: 'cart-unit',
      isolatedBecause: null,
      file: 'src/cart.ts',
      id: 'killed000001',
      kind: 'expression',
      cause: 'assertion',
      replacement: "''",
      status: 'Killed',
      original: "'cm'",
      ignoredBy: null,
      path: 'batch',
      endColumn: 23,
      reason: null,
      duration: 2,
      scope: null,
      column: 19,
      endLine: 1,
      start: 18,
      line: 1,
      end: 22,
    })
    expect(report.mutants[1]).toMatchObject({
      killedIn: 'test/limit.test.ts',
      isolatedBecause: 'static',
      cause: 'time-limit',
      path: 'isolated',
      duration: 250,
    })
    expect(report.mutants[5]).toMatchObject({
      reason: 'shown elsewhere',
      status: 'Ignored',
      killedIn: null,
      path: null,
    })
  })

  it('lists the referenced tests by file and line with display paths', () => {
    let report = buildRunReport(createRunResult())

    expect(report.tests).toStrictEqual([
      {
        file: 'test/cart.test.ts',
        name: 'cart > unit',
        repeatable: true,
        id: 'cart-unit',
        duration: 4,
        line: 4,
      },
      {
        name: 'fits > small sizes',
        file: 'test/cart.test.ts',
        repeatable: false,
        id: 'fits-small',
        duration: 8,
        line: 12,
      },
    ])
  })

  it('sorts tests without a line first, then by name', () => {
    let result = createRunResult()
    result.tests = result.tests.map(test => ({ ...test, line: null }))

    let report = buildRunReport(result)

    expect(report.tests.map(test => test.id)).toStrictEqual([
      'cart-unit',
      'fits-small',
    ])
  })

  it('references the killing test even when it is not covering', () => {
    let result = createRunResult()
    result.results[0]!.coveredBy = []
    result.results[0]!.killedBy = 'unused'

    let report = buildRunReport(result)

    expect(report.tests.map(test => test.id)).toStrictEqual([
      'cart-unit',
      'fits-small',
      'unused',
    ])
  })

  it('counts, scores and rounds the summary', () => {
    let report = buildRunReport(createRunResult())

    expect(report).toMatchObject({
      mutators: [
        { id: 'string-literal', mutants: 1 },
        { id: 'number-literal', mutants: 1 },
        { id: 'comparison-operator', mutants: 1 },
        { id: 'conditional', mutants: 1 },
        { id: 'arithmetic-operator', mutants: 2 },
      ],
      files: [{ file: 'src/cart.ts', parsed: true, mutants: 6 }],
      diagnostics: [{ code: 'config-overridden' }],
      preset: 'recommended',
      runner: 'vitest',
      schemaVersion: 1,
      command: 'run',
      mode: 'fast',
    })
    expect(report.summary).toStrictEqual({
      duration: {
        isolated: 700,
        startup: 210,
        dryRun: 190,
        total: 1300,
        batch: 200,
      },
      staticCost: [
        { file: 'src/cart.ts', duration: 600, mutants: 1, units: 2 },
      ],
      runs: { isolated: 2, batch: 2, dry: 1 },
      totalUnrepeatableTests: 1,
      totalErrorMutants: 1,
      coveredScore: 66.67,
      totalNoCoverage: 1,
      totalSurvived: 1,
      totalIsolated: 3,
      totalWarnings: 1,
      totalIgnored: 1,
      totalTimeout: 1,
      totalMutants: 6,
      threshold: null,
      totalKilled: 1,
      totalStatic: 1,
      totalErrors: 0,
      totalBatch: 1,
      totalFiles: 1,
      passed: false,
      score: 50,
    })
  })

  it('reports the checks of fast mode as null in the default mode', () => {
    let result = createRunResult()
    result.mode = 'isolated'
    result.unrepeatable = null
    result.timing.batch = null

    let report = buildRunReport(result)

    expect(report.summary).toMatchObject({
      totalUnrepeatableTests: null,
      duration: { batch: null },
      totalBatch: null,
    })
    expect(report.tests.map(test => test.repeatable)).toStrictEqual([
      null,
      null,
    ])
  })

  it.each([
    { given: 'no threshold', threshold: null, passed: true },
    { given: 'a score at the threshold', threshold: 60, passed: true },
    { given: 'a score below the threshold', threshold: 61, passed: false },
  ])('passes a run without errors with $given', ({ threshold, passed }) => {
    let result = createRunResult()
    result.results[3]!.status = 'Killed'
    result.threshold = threshold

    let report = buildRunReport(result)

    expect(report.summary).toMatchObject({ threshold, passed })
  })

  it('fails a run with an error diagnostic', () => {
    let result = createRunResult()
    result.results[3]!.status = 'Killed'
    result.diagnostics[0]!.severity = 'error'

    let report = buildRunReport(result)

    expect(report.summary).toMatchObject({ totalErrors: 1, passed: false })
  })

  it('passes any threshold without mutants to score', () => {
    let result = createRunResult()
    for (let verdict of result.results) {
      verdict.status = 'Ignored'
    }
    result.threshold = 80

    let report = buildRunReport(result)

    expect(report.summary).toMatchObject({
      coveredScore: null,
      passed: true,
      score: null,
    })
  })
})
