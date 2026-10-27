import type { IndexedMutant } from '../../../types/html/indexed-mutant'
import type { ReportIndex } from '../../../types/html/report-index'

import { describeStatus } from './describe-status'
import { renderChange } from './render-change'
import { escapeHtml } from './escape-html'
import { html } from './html'

/**
 * Renders a mutant to act on as a row that opens it: its status, position,
 * mutator, change, the hint of what to do and its short id. The hint is the
 * likeliest test file to extend, for a mutant no test reaches the line no test
 * reaches, and for an error its message.
 *
 * @param index - Index of the report.
 * @param mutant - Mutant to show.
 * @returns HTML of the row.
 */
export function renderMutantRow(
  index: ReportIndex,
  mutant: IndexedMutant,
): string {
  let { report } = index
  let { label, key } = describeStatus(mutant.status)
  let file = index.files[mutant.file]!
  let hint = ''
  if (mutant.status === 'Error') {
    hint = mutant.message === undefined ? '' : report.texts[mutant.message]!
  } else if (mutant.status === 'NoCoverage') {
    hint = `no test reaches line ${mutant.line}`
  } else if (mutant.testFiles?.[0]) {
    hint = report.testFiles[mutant.testFiles[0][0]]!
  }
  return html`<a
    class="row"
    href="#/mutant/${mutant.id}"
    ><span
      class="dot status-${key}"
      role="img"
      aria-label="${label}"
    ></span
    ><span class="where">${mutant.line}:${mutant.column}</span
    ><span class="chip">${escapeHtml(report.mutators[mutant.mutator]!.id)}</span
    >${renderChange(file.source, mutant)}<span
      class="hint"
      title="${escapeHtml(hint)}"
      ><bdi>${escapeHtml(hint)}</bdi></span
    ><span class="id">${mutant.id.slice(0, report.meta.idLength)}</span></a
  >`
}
