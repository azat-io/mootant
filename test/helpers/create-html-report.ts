import type { HtmlReport } from '../../types/report/html-report'

import { buildHtmlReport } from '../../cli/html/build-html-report'
import { createRunResult } from './create-run-result'

/**
 * Builds the data of an HTML report of the run of `createRunResult`, with a
 * skipped candidate at the place of its survivor that the survivor justifies.
 *
 * @returns Data of the report; a fresh object on every call.
 */
export function createHtmlReport(): HtmlReport {
  let result = createRunResult()
  let [file] = result.files
  let start = file!.source!.indexOf('size < limit')
  file!.skipped = [
    {
      reason:
        'a lower bound of an operand makes the inputs where it differs impossible',
      by: { mutator: 'comparison-operator', id: 'survived0001', start },
      end: start + 'size < limit'.length,
      mutator: 'comparison-operator',
      replacement: 'size <= limit',
      category: 'equivalent',
      file: 'src/cart.ts',
      rule: 'lower-bound',
      kind: 'expression',
      heuristic: true,
      start,
    },
  ]
  return buildHtmlReport(result, {
    command: 'mootant run src --html',
    date: '2026-10-27T10:05:00.000Z',
    recheck: 'mootant run src',
    version: '1.2.3',
    project: 'cart',
    idLength: 4,
  })
}
