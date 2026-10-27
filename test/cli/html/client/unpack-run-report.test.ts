import { describe, expect, it } from 'vitest'

import { unpackRunReport } from '../../../../cli/html/client/unpack-run-report'
import { buildRunReport } from '../../../../cli/report/build-run-report'
import { buildHtmlReport } from '../../../../cli/html/build-html-report'
import { createRunResult } from '../../../helpers/create-run-result'

describe('unpackRunReport', () => {
  it('rebuilds the run report the data was packed from', () => {
    let result = createRunResult()
    let [file] = result.files
    let [killed, timeout, survived] = file!.mutants
    killed!.focus = {
      start: killed!.start + 1,
      end: killed!.start + 3,
      text: '',
    }
    timeout!.kind = 'block'
    survived!.scope = 'fits'
    result.results[0]!.killedIn = '/repo/test/other.test.ts'
    result.results[0]!.cached = true
    let start = file!.source!.indexOf('size < limit')
    let end = start + 'size < limit'.length
    file!.skipped = [
      {
        by: { mutator: 'comparison-operator', id: 'survived0001', start },
        focus: { start: start + 5, end: start + 6, text: '<=' },
        reason: 'a lower bound makes it impossible',
        mutator: 'comparison-operator',
        replacement: 'size <= limit',
        category: 'equivalent',
        file: 'src/cart.ts',
        rule: 'lower-bound',
        kind: 'expression',
        heuristic: true,
        start,
        end,
      },
      {
        by: { mutator: 'logical-operator', start: start + 7, id: null },
        reason: 'another mutant makes the same change',
        replacement: `${'size'.repeat(20)} < limit`,
        mutator: 'comparison-operator',
        category: 'duplicate',
        file: 'src/cart.ts',
        rule: 'duplicate',
        heuristic: false,
        kind: null,
        start,
        end,
      },
      {
        mutator: 'comparison-operator',
        reason: 'it changes nothing',
        category: 'equivalent',
        replacement: 'size',
        file: 'src/cart.ts',
        heuristic: false,
        rule: 'O8',
        kind: null,
        by: null,
        start,
        end,
      },
    ]
    result.files.push({
      absolute: '/repo/src/broken.ts',
      file: 'src/broken.ts',
      diagnostics: [],
      parsed: false,
      source: null,
      skipped: [],
      mutants: [],
    })
    let report = buildHtmlReport(result, {
      command: 'mootant run src --html',
      date: '2026-10-27T10:05:00.000Z',
      recheck: 'mootant run src',
      version: '1.2.3',
      project: 'cart',
      idLength: 4,
    })

    expect(report.mutants[0]).toMatchObject({ killedBy: 1, killedIn: 1 })
    expect(unpackRunReport(report)).toStrictEqual(
      buildRunReport(result, {
        recheck: 'mootant run src',
        skipped: true,
        all: true,
      }),
    )
  })
})
