import type { StatusCounts } from '../../../types/run/status-counts'

import { pluralize } from '../../../core/text/pluralize'
import { html } from './html'

/**
 * Renders the cells of a table row with the counts of a file or a mutator:
 * killed with timed out, survived, without coverage, and the rest (timeouts,
 * errors and ignored mutants), with zero as a muted dash.
 *
 * @param counts - Mutants by status.
 * @returns HTML of four cells.
 */
export function renderCountCells(counts: StatusCounts): string {
  let other = [
    counts.Timeout > 0 ? `${counts.Timeout} timeout` : '',
    counts.Error > 0 ?
      html`<span class="bad">${pluralize(counts.Error, 'error')}</span>`
    : '',
    counts.Ignored > 0 ? `${counts.Ignored} ignored` : '',
  ].filter(Boolean)
  return [
    renderNumber(counts.Killed),
    renderNumber(counts.Survived, 'hot'),
    renderNumber(counts.NoCoverage, 'warn'),
    other.length === 0 ? '<span class="zero">–</span>' : other.join(', '),
  ]
    .map(cell => html`<td>${cell}</td>`)
    .join('')
}

/**
 * Renders a count, zero as a muted dash.
 *
 * @param count - Number to show.
 * @param className - Class of a count above zero.
 * @returns HTML of the count.
 */
function renderNumber(count: number, className = ''): string {
  if (count === 0) {
    return '<span class="zero">–</span>'
  }
  return className === '' ?
      String(count)
    : html`<span class="${className}">${count}</span>`
}
