import { describe, expect, it } from 'vitest'

import { buildHtmlReport } from '../../../cli/html/build-html-report'
import { createHtmlReport } from '../../helpers/create-html-report'
import { createRunResult } from '../../helpers/create-run-result'

describe('buildHtmlReport', () => {
  it('packs the run report with sources, tests and skipped candidates', () => {
    let report = createHtmlReport()

    expect(report.meta).toStrictEqual({
      command: 'mootant run src --html',
      date: '2026-10-27T10:05:00.000Z',
      recheck: 'mootant run src',
      runnerVersion: '5.0.4',
      preset: 'recommended',
      version: '1.2.3',
      runner: 'vitest',
      project: 'cart',
      cache: false,
      mode: 'fast',
      idLength: 4,
      since: null,
    })
    expect(report.files).toStrictEqual([
      {
        source: expect.stringContaining('export let unit'),
        file: 'src/cart.ts',
        parsed: true,
      },
    ])
    expect(report.testFiles).toStrictEqual([
      'test/cart.test.ts',
      'test/other.test.ts',
      'test/limit.test.ts',
    ])
    expect(report.tests).toStrictEqual([
      {
        name: 'fits > small sizes',
        duration: 7.6,
        survivors: 1,
        kills: 0,
        reach: 2,
        line: 12,
        file: 0,
      },
      {
        name: 'cart > unit',
        duration: 4.4,
        survivors: 1,
        kills: 1,
        reach: 2,
        file: 0,
        line: 4,
      },
      {
        name: 'unused',
        duration: 4.4,
        survivors: 0,
        line: null,
        kills: 0,
        reach: 0,
        file: 1,
      },
    ])
    expect(report.mutants[0]).toStrictEqual({
      id: 'killed000001',
      cause: 'assertion',
      replacement: "''",
      status: 'Killed',
      path: 'batch',
      duration: 2,
      killedBy: 1,
      message: 0,
      mutator: 0,
      start: 18,
      reach: 1,
      file: 0,
      end: 22,
    })
    expect(report.mutants[1]).toMatchObject({
      isolatedBecause: 'static',
      cause: 'time-limit',
      killedIn: 2,
      reach: 0,
    })
    expect(report.mutants[2]).toMatchObject({
      testFiles: [
        [0, 2],
        [1, 0],
      ],
      coveredBy: [0, 1],
    })
    expect(report.mutants[5]).toMatchObject({
      ignoredBy: { directive: 'mootant-ignore-next-line', column: 4, line: 7 },
      reason: 2,
    })
    expect(report.skipped).toStrictEqual([
      {
        by: {
          mutator: 'comparison-operator',
          id: 'survived0001',
          column: 10,
          line: 4,
        },
        replacement: 'size <= limit',
        category: 'equivalent',
        rule: 'lower-bound',
        heuristic: true,
        mutator: 2,
        reason: 3,
        start: 83,
        file: 0,
        end: 95,
      },
    ])
    expect(report.texts).toStrictEqual([
      "expected '' to be 'cm'",
      'Tries of test/cart.test.ts went missing twice.',
      'shown elsewhere',
      'a lower bound of an operand makes the inputs where it differs impossible',
    ])
    expect(report.summary.totalMutants).toBe(6)
    expect(report.mutators.map(mutator => mutator.id)).toContain('conditional')
    expect(report.diagnostics).toHaveLength(1)
  })

  it('keeps the focus, scope and cache mark of a mutant', () => {
    let result = createRunResult()
    let [mutant] = result.files[0]!.mutants
    mutant!.focus = {
      start: mutant!.start + 1,
      end: mutant!.start + 3,
      text: '',
    }
    mutant!.scope = 'Cart.unit'
    result.results[0]!.cached = true
    let report = buildHtmlReport(result, {
      date: '2026-10-27T10:05:00.000Z',
      recheck: 'mootant run src',
      command: 'mootant run src',
      version: '1.2.3',
      project: 'cart',
      idLength: 4,
    })

    expect(report.mutants[0]).toMatchObject({
      focus: { replacement: '', start: 19, end: 21 },
      scope: report.texts.indexOf('Cart.unit'),
      cached: true,
    })
  })
})
