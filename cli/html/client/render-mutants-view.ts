import type { MutantsFilter } from '../../../types/html/mutants-filter'
import type { ReportIndex } from '../../../types/html/report-index'
import type { RunStatus } from '../../../types/run/run-status'

import { renderStatusFilter } from './render-status-filter'
import { renderMutantsTable } from './render-mutants-table'
import { escapeHtml } from './escape-html'
import { getIcon } from './get-icon'
import { html } from './html'

/**
 * Statuses of the filter, in its order.
 */
const FILTERS: RunStatus[] = [
  'Survived',
  'NoCoverage',
  'Error',
  'Timeout',
  'Killed',
  'Ignored',
]

/**
 * Renders the page of every mutant: a filter by status, the mutator the page is
 * narrowed to with a button to show every mutator, a text filter and the table
 * of the matching mutants.
 *
 * @param index - Index of the report.
 * @param shown - Status, mutator, text and number of rows to show.
 * @returns HTML of the page.
 */
export function renderMutantsView(
  index: ReportIndex,
  shown: MutantsFilter,
): string {
  let { mutator, filter, query } = shown
  let buttons = renderStatusFilter({
    attribute: 'data-mutants-filter',
    total: index.mutants.length,
    counts: index.counts,
    statuses: FILTERS,
    filter,
  })
  let narrowed =
    mutator === null ? '' : (
      html`<span class="mutator-filter"
        >mutator <code>${escapeHtml(mutator)}</code
        ><button
          class="mutator-clear"
          type="button"
          data-clear-mutator
          aria-label="Show every mutator"
        >
          ${getIcon('cross')}
        </button></span
      >`
    )
  return html`<div class="page container">
    <div class="section-head">
      <div>
        <h1 class="title">Mutants</h1>
        <p class="lead">
          Every mutant of the run in file order. Filter by status, or type an
          id, a mutator, a file or a piece of code.
        </p>
      </div>
    </div>
    <div class="toolbar">
      <div
        class="segmented"
        role="group"
        aria-label="Status"
      >
        ${buttons}
      </div>
      <div class="toolbar-end">
        ${narrowed}<label class="filter"
          >${getIcon('filter')}<input
            type="text"
            placeholder="Filter mutants"
            value="${escapeHtml(query)}"
            data-mutants-query
            aria-label="Filter mutants"
        /></label>
      </div>
    </div>
    <div
      class="card table-wrap"
      id="mutants-table"
    >
      ${renderMutantsTable(index, shown)}
    </div>
  </div>`
}
