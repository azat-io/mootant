import { describe, expect, it } from 'vitest'

import { slimRunReport } from '../../../cli/report/slim-run-report'
import { createRunReport } from '../../helpers/create-run-report'

describe('slimRunReport', () => {
  it('keeps what an agent needs of each mutant, shortening killed and timed-out ones', () => {
    let slim = slimRunReport(createRunReport())

    expect(slim.mutants).toStrictEqual([
      {
        killedIn: 'test/cart.test.ts',
        mutator: 'string-literal',
        file: 'src/cart.ts',
        id: 'killed000001',
        status: 'Killed',
        path: 'batch',
        column: 19,
        line: 1,
      },
      {
        killedIn: 'test/limit.test.ts',
        mutator: 'number-literal',
        file: 'src/cart.ts',
        id: 'timeout00001',
        status: 'Timeout',
        column: 20,
        line: 2,
      },
      {
        test: {
          name: 'fits > small sizes',
          file: 'test/cart.test.ts',
          line: 12,
        },
        testFiles: { 'test/other.test.ts': 0, 'test/cart.test.ts': 2 },
        recheck: 'mootant run src --mutant survived0001',
        before: ['  return size < limit'],
        after: ['  return size <= limit'],
        mutator: 'comparison-operator',
        file: 'src/cart.ts',
        id: 'survived0001',
        status: 'Survived',
        column: 10,
        tests: 2,
        line: 4,
      },
      {
        test: {
          name: 'fits > small sizes',
          file: 'test/cart.test.ts',
          line: 12,
        },
        message: 'Tries of test/cart.test.ts went missing twice.',
        recheck: 'mootant run src --mutant errored00001',
        testFiles: { 'test/cart.test.ts': 1 },
        before: ['  return size < limit'],
        after: ['  return true'],
        mutator: 'conditional',
        file: 'src/cart.ts',
        id: 'errored00001',
        status: 'Error',
        column: 10,
        tests: 1,
        line: 4,
      },
      {
        recheck: 'mootant run src --mutant uncovered001',
        before: ['export let ratio = 2 * 3'],
        after: ['export let ratio = 2 / 3'],
        mutator: 'arithmetic-operator',
        status: 'NoCoverage',
        file: 'src/cart.ts',
        id: 'uncovered001',
        column: 20,
        tests: 0,
        line: 6,
      },
      {
        ignoredBy: {
          directive: 'mootant-ignore-next-line',
          column: 4,
          line: 7,
        },
        before: ['export let scale = 4 - 1'],
        after: ['export let scale = 4 + 1'],
        mutator: 'arithmetic-operator',
        reason: 'shown elsewhere',
        file: 'src/cart.ts',
        id: 'ignored00001',
        status: 'Ignored',
        column: 20,
        line: 8,
      },
    ])
  })

  it('keeps the counts, scores, total duration and the run settings, without null fields', () => {
    let report = createRunReport()

    expect(slimRunReport(report)).toMatchObject({
      summary: {
        duration: { total: 1300 },
        totalErrorMutants: 1,
        coveredScore: 66.67,
        totalNoCoverage: 1,
        totalSurvived: 1,
        totalWarnings: 1,
        totalIgnored: 1,
        totalTimeout: 1,
        totalMutants: 6,
        totalKilled: 1,
        totalErrors: 0,
        totalTests: 3,
        totalBatch: 1,
        totalFiles: 1,
        passed: false,
        score: 50,
      },
      diagnostics: report.diagnostics,
      preset: 'recommended',
      runner: 'vitest',
      schemaVersion: 3,
      command: 'run',
      listed: 'all',
      mode: 'fast',
    })
    expect(Object.keys(slimRunReport(report))).not.toContain('since')
    expect(Object.keys(slimRunReport(report).summary)).not.toContain(
      'threshold',
    )
  })

  it('keeps the threshold, the revision of --since and a test without a line, and leaves out what is null', () => {
    let report = createRunReport()
    report.summary.threshold = 80
    report.summary.score = null
    report.summary.coveredScore = null
    report.summary.totalBatch = null
    report.since = { base: 'abc123', ref: 'main' }
    report.mutants[2]!.test!.line = null
    report.mutants[1]!.killedIn = null

    let slim = slimRunReport(report)

    expect(slim.since).toStrictEqual({ base: 'abc123', ref: 'main' })
    expect(slim.summary.threshold).toBe(80)
    expect(Object.keys(slim.summary)).not.toContain('score')
    expect(Object.keys(slim.summary)).not.toContain('coveredScore')
    expect(Object.keys(slim.summary)).not.toContain('totalBatch')
    expect(slim.mutants[2]).toMatchObject({
      test: { name: 'fits > small sizes', file: 'test/cart.test.ts' },
    })
    expect(
      Object.keys((slim.mutants[2] as { test: object }).test),
    ).toStrictEqual(expect.not.arrayContaining(['line']))
    expect(slim.mutants[1]).not.toHaveProperty('killedIn')
  })

  it('puts the mutants last, after the counts, diagnostics and settings', () => {
    let report = createRunReport()
    report.since = { base: 'abc123', ref: 'main' }

    expect(Object.keys(slimRunReport(report))).toStrictEqual([
      'summary',
      'schemaVersion',
      'diagnostics',
      'command',
      'listed',
      'runner',
      'preset',
      'mode',
      'since',
      'mutants',
    ])
  })

  it('keeps the cause of a verdict and the scope when they are set', () => {
    let report = createRunReport()
    report.mutants[3]!.cause = 'assertion'
    report.mutants[3]!.scope = 'fits'

    expect(slimRunReport(report).mutants[3]).toMatchObject({
      cause: 'assertion',
      scope: 'fits',
    })
  })
})
