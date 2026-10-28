import type { ReportIndex } from '../../../types/html/report-index'
import type { FileView } from '../../../types/html/file-view'

import { filterByStatus } from './filter-by-status'
import { tokenizeSource } from './tokenize-source'
import { describeStatus } from './describe-status'
import { paintRanges } from './paint-ranges'
import { renderCode } from './render-code'

/**
 * Renders the code of the shown file: the badges count the mutants the filter
 * shows, and the code marks the mutants to act on, or only the mutants of the
 * filtered status, plus the skipped candidates when they are shown.
 *
 * @param index - Index of the report.
 * @param view - What the files page shows.
 * @returns HTML of the lines.
 */
export function renderFileCode(index: ReportIndex, view: FileView): string {
  let { filter, file } = view
  let visible = filterByStatus(file.mutants, filter)
  let marked = filter === 'all' ? file.actionable : visible
  let { length } = file.source
  return renderCode({
    skipped:
      view.showSkipped ?
        paintRanges(
          length,
          file.skipped.map(entry => ({
            value: entry.index,
            start: entry.start,
            end: entry.end,
            rank: 0,
          })),
        )
      : null,
    painted: paintRanges(
      length,
      marked.map(mutant => ({
        rank: describeStatus(mutant.status).rank,
        value: mutant.index,
        start: mutant.start,
        end: mutant.end,
      })),
    ),
    tokens: tokenizeSource(file.source),
    selected: view.selected,
    mutants: index.mutants,
    visible,
    file,
  })
}
