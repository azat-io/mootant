import type { StatusCounts } from '../../../types/run/status-counts'
import type { RunStatus } from '../../../types/run/run-status'

import { describeStatus } from './describe-status'
import { html } from './html'

/**
 * Filter by status as its buttons show it.
 */
interface StatusFilter {
  /**
   * Statuses the filter offers, in its order; those without mutants get no
   * button.
   */
  statuses: readonly RunStatus[]

  /**
   * Status of the mutants shown, or `all`.
   */
  filter: RunStatus | 'all'

  /**
   * Number of mutants with each status.
   */
  counts: StatusCounts

  /**
   * Name of the data attribute that holds the status of a button, which its
   * click handler reads, such as `data-filter`.
   */
  attribute: string

  /**
   * Number of mutants of every status, which All shows.
   */
  total: number
}

/**
 * Renders the buttons of a filter by status: All, then each status of the
 * filter that has mutants, with its dot. Each button shows its count, and the
 * button of the shown status is pressed.
 *
 * @param shown - Statuses, counts and shown status of the filter, the total and
 *   the attribute of its buttons.
 * @returns HTML of the buttons.
 */
export function renderStatusFilter(shown: StatusFilter): string {
  let { attribute, statuses, counts, filter, total } = shown
  return (
    ['all', ...statuses.filter(status => counts[status] > 0)] as (
      RunStatus | 'all'
    )[]
  )
    .map(status => {
      let count = status === 'all' ? total : counts[status]
      let label = status === 'all' ? 'All' : describeStatus(status).label
      let dot =
        status === 'all' ? '' : (
          html`<span class="dot status-${describeStatus(status).key}"></span>`
        )
      return html`<button
        class="segment-button"
        type="button"
        ${attribute}="${status}"
        aria-pressed="${filter === status}"
      >
        ${dot}${label.charAt(0).toUpperCase() + label.slice(1)}
        <span class="count">${count}</span>
      </button>`
    })
    .join('')
}
