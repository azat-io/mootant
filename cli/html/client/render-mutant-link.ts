import type { IndexedMutant } from '../../../types/html/indexed-mutant'
import type { ReportIndex } from '../../../types/html/report-index'

import { describeStatus } from './describe-status'
import { renderChange } from './render-change'
import { escapeHtml } from './escape-html'
import { html } from './html'

/**
 * Renders a mutant in a list of a side panel: a link to the mutant with the dot
 * of its status, its mutator, its change on one line and its status.
 *
 * @param index - Index of the report.
 * @param mutant - Mutant to link to.
 * @returns HTML of the list item.
 */
export function renderMutantLink(
  index: ReportIndex,
  mutant: IndexedMutant,
): string {
  let status = describeStatus(mutant.status)
  return html`<li>
    <a
      class="also-link"
      href="#/mutant/${mutant.id}"
      ><span class="dot status-${status.key}"></span
      ><span class="grow"
        ><code>${escapeHtml(index.report.mutators[mutant.mutator]!.id)}</code>
        ${renderChange(index.files[mutant.file]!.source, mutant)}</span
      ><span class="muted">${status.label}</span></a
    >
  </li>`
}
