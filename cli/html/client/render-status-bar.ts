import type { StatusCounts } from '../../../types/html/status-counts'
import type { RunStatus } from '../../../types/run/run-status'

import { describeStatus } from './describe-status'
import { html } from './html'

/**
 * Statuses in the order of the bar: detected, then to act on, then ignored.
 */
const ORDER: RunStatus[] = [
  'Killed',
  'Timeout',
  'Survived',
  'NoCoverage',
  'Error',
  'Ignored',
]

/**
 * Renders a bar with a segment for each status as wide as its share, labeled
 * with the counts for assistive technology.
 *
 * @param counts - Mutants by status.
 * @param small - Whether the bar sits in a table row.
 * @returns HTML of the bar.
 */
export function renderStatusBar(counts: StatusCounts, small = false): string {
  let total = ORDER.reduce((sum, status) => sum + counts[status], 0)
  let shown = ORDER.filter(status => counts[status] > 0)
  let label = shown
    .map(status => `${counts[status]} ${describeStatus(status).label}`)
    .join(', ')
  let segments = shown
    .map(
      status =>
        html`<span
          class="segment status-${describeStatus(status).key}"
          style="flex-basis: ${(counts[status] / total) * 100}%"
        ></span>`,
    )
    .join('')
  return html`<div
    class="status-bar${small ? ' small' : ''}"
    role="img"
    aria-label="${label || 'no mutants'}"
  >
    ${segments}
  </div>`
}
