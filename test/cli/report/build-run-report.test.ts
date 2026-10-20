import { describe, expect, it } from 'vitest'

import type { RunReport } from '../../../types/report/run-report'
import type { RunResult } from '../../../types/run/run-result'

import { buildRunReport } from '../../../cli/report/build-run-report'
import { createRunResult } from '../../helpers/create-run-result'

/**
 * Builds the report of a run of `src` that lists every mutant.
 *
 * @param result - Outcome of the run.
 * @param all - Whether to list every mutant.
 * @returns Report of the run.
 */
function build(result: RunResult, all = true): RunReport {
  return buildRunReport(result, { recheck: 'mootant run src', all })
}

describe('buildRunReport', () => {
  it('adds the verdicts to the list entries of the mutants', () => {
    let report = build(createRunResult())

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
    expect(report.mutants[1]!.coveredBy).toBeNull()
    expect(report.mutants[5]!.coveredBy).toStrictEqual([])
    expect(report.mutants[0]).toStrictEqual({
      killedBy: { file: 'test/cart.test.ts', name: 'cart > unit', line: 4 },
      recheck: 'mootant run src --mutant killed000001',
      before: ["export let unit = 'cm'"],
      message: "expected '' to be 'cm'",
      after: ["export let unit = ''"],
      killedIn: 'test/cart.test.ts',
      mutator: 'string-literal',
      isolatedBecause: null,
      file: 'src/cart.ts',
      id: 'killed000001',
      kind: 'expression',
      cause: 'assertion',
      replacement: "''",
      status: 'Killed',
      original: "'cm'",
      coveredBy: null,
      testFiles: null,
      ignoredBy: null,
      path: 'batch',
      cached: false,
      endColumn: 23,
      reason: null,
      cutStart: 0,
      tests: null,
      duration: 2,
      scope: null,
      test: null,
      column: 19,
      endLine: 1,
      cutEnd: 0,
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
      testFiles: {},
      recheck: null,
      test: null,
      path: null,
      tests: 0,
    })
    expect(report.listed).toBe('all')
  })

  it('lists only the mutants to act on unless every mutant is asked for', () => {
    let report = build(createRunResult(), false)

    expect(report.mutants.map(mutant => mutant.id)).toStrictEqual([
      'survived0001',
      'errored00001',
      'uncovered001',
    ])
    expect(report.mutants[0]).toMatchObject({
      coveredBy: [
        { name: 'fits > small sizes', file: 'test/cart.test.ts', line: 12 },
        { file: 'test/cart.test.ts', name: 'cart > unit', line: 4 },
      ],
      test: {
        name: 'fits > small sizes',
        file: 'test/cart.test.ts',
        line: 12,
      },
      testFiles: { 'test/other.test.ts': 0, 'test/cart.test.ts': 2 },
      recheck: 'mootant run src --mutant survived0001',
      tests: 2,
    })
    expect(report.mutants[2]).toMatchObject({
      testFiles: {},
      test: null,
      tests: 0,
    })
    expect(report).toMatchObject({
      summary: { totalMutants: 6, totalKilled: 1 },
      listed: 'actionable',
    })
  })

  it('names at most three test files of a mutant, in their order', () => {
    let result = createRunResult()
    result.results[2]!.testFiles = ['d', 'c', 'b', 'a'].map(
      name => `/repo/test/${name}.test.ts`,
    )
    result.tests.push(
      { ...result.tests[0]!, file: '/repo/test/c.test.ts', id: 'c-test' },
      { ...result.tests[0]!, file: '/repo/test/a.test.ts', id: 'a-test' },
    )
    result.results[2]!.coveredBy = ['c-test', 'a-test']

    let report = build(result)

    expect(Object.entries(report.mutants[2]!.testFiles!)).toStrictEqual([
      ['test/d.test.ts', 0],
      ['test/c.test.ts', 1],
      ['test/b.test.ts', 0],
    ])
    expect(report.mutants[2]!.tests).toBe(2)
  })

  it('adds the file of the first covering test after the three likeliest when it ranks lower', () => {
    let result = createRunResult()
    result.results[2]!.testFiles = ['d', 'c', 'b', 'a'].map(
      name => `/repo/test/${name}.test.ts`,
    )
    result.tests.push({
      ...result.tests[0]!,
      file: '/repo/test/a.test.ts',
      id: 'a-test',
    })
    result.results[2]!.coveredBy = ['a-test']

    let report = build(result)

    expect(Object.entries(report.mutants[2]!.testFiles!)).toStrictEqual([
      ['test/d.test.ts', 0],
      ['test/c.test.ts', 0],
      ['test/b.test.ts', 0],
      ['test/a.test.ts', 1],
    ])
    expect(report.mutants[2]!.test).toMatchObject({ file: 'test/a.test.ts' })
  })

  it('counts, scores and rounds the summary', () => {
    let report = build(createRunResult())

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
      runnerVersion: '5.0.4',
      preset: 'recommended',
      runner: 'vitest',
      schemaVersion: 3,
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
      totalCached: null,
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
      totalTests: 3,
      totalBatch: 1,
      totalFiles: 1,
      passed: false,
      score: 50,
    })
  })

  it('counts the verdicts that came from the cache when it was on', () => {
    let result = createRunResult()
    result.cache = true
    result.results[0]!.cached = true
    result.results[2]!.cached = true

    let report = build(result)

    expect(report.summary.totalCached).toBe(2)
    expect(report.mutants.map(mutant => mutant.cached)).toStrictEqual([
      true,
      false,
      true,
      false,
      false,
      false,
    ])
  })

  it('keeps the revision of --since with its merge base', () => {
    let result = createRunResult()

    expect(build(result).since).toBeNull()

    result.since = { base: 'abc123', ref: 'main' }

    expect(build(result).since).toStrictEqual({ base: 'abc123', ref: 'main' })
  })

  it('reports the checks of fast mode as null in the default mode', () => {
    let result = createRunResult()
    result.mode = 'isolated'
    result.unrepeatable = null
    result.timing.batch = null

    let report = build(result)

    expect(report.summary).toMatchObject({
      totalUnrepeatableTests: null,
      duration: { batch: null },
      totalBatch: null,
    })
  })

  it.each([
    { given: 'no threshold', threshold: null, passed: true },
    { given: 'a score at the threshold', threshold: 60, passed: true },
    { given: 'a score below the threshold', threshold: 61, passed: false },
  ])('passes a run without errors with $given', ({ threshold, passed }) => {
    let result = createRunResult()
    result.results[3]!.status = 'Killed'
    result.threshold = threshold

    let report = build(result)

    expect(report.summary).toMatchObject({ threshold, passed })
  })

  it('fails a run with an error diagnostic', () => {
    let result = createRunResult()
    result.results[3]!.status = 'Killed'
    result.diagnostics[0]!.severity = 'error'

    let report = build(result)

    expect(report.summary).toMatchObject({ totalErrors: 1, passed: false })
  })

  it('passes any threshold without mutants to score', () => {
    let result = createRunResult()
    for (let verdict of result.results) {
      verdict.status = 'Ignored'
    }
    result.threshold = 80

    let report = build(result)

    expect(report.summary).toMatchObject({
      coveredScore: null,
      passed: true,
      score: null,
    })
  })
})
