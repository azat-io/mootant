import type { MutantsFilter } from '../../../types/html/mutants-filter'
import type { ReportIndex } from '../../../types/html/report-index'

import { getTableLayout } from './get-table-layout'
import { describeStatus } from './describe-status'
import { measureColumn } from './measure-column'
import { renderChange } from './render-change'
import { escapeHtml } from './escape-html'
import { formatTime } from './format-time'
import { html } from './html'

/**
 * Most characters the location column makes room for; a longer one wraps.
 */
const MAX_LOCATION = 40

/**
 * Most characters the mutator column makes room for; a longer id is cut.
 */
const MAX_MUTATOR = 28

/**
 * Fewest characters the change column keeps.
 */
const MIN_CHANGE = 24

/**
 * Characters the dot before a status takes, with the space after it.
 */
const DOT = 3

/**
 * Renders the table of the mutants that match a status, a mutator and a text:
 * an id or its start, a mutator, a `file:line` or a piece of the change. A row
 * opens the mutant; past the limit a button shows more. The columns take the
 * widths of every mutant, so a filter does not move them.
 *
 * @param index - Index of the report.
 * @param shown - Status, mutator, text and number of rows to show.
 * @returns HTML of the table.
 */
export function renderMutantsTable(
  index: ReportIndex,
  shown: MutantsFilter,
): string {
  let { mutator, filter, query, limit } = shown
  let { report } = index
  let text = query.trim().toLowerCase()
  let matched = index.mutants.filter(mutant => {
    let { id } = report.mutators[mutant.mutator]!
    if (
      (filter !== 'all' && mutant.status !== filter) ||
      (mutator !== null && id !== mutator)
    ) {
      return false
    }
    let file = index.files[mutant.file]!
    return (
      text === '' ||
      mutant.id.startsWith(text) ||
      id.includes(text) ||
      `${file.path}:${mutant.line}`.toLowerCase().includes(text) ||
      mutant.original.toLowerCase().includes(text) ||
      mutant.replacement.toLowerCase().includes(text)
    )
  })
  if (matched.length === 0) {
    return '<p class="empty">No mutant matches.</p>'
  }
  let rows = matched.slice(0, limit).map(mutant => {
    let { label, key } = describeStatus(mutant.status)
    let file = index.files[mutant.file]!
    let href = `#/mutant/${mutant.id}`
    let tests = mutant.coveredBy?.length ?? mutant.reach!
    return html`<tr data-href="${href}">
      <th
        scope="row"
        class="path-cell"
      >
        <a href="${href}"
          >${escapeHtml(file.path)}<span class="dim"
            >:${mutant.line}:${mutant.column}</span
          ></a
        >
      </th>
      <td class="left"><span class="dot status-${key}"></span> ${label}</td>
      <td class="left dim">
        ${escapeHtml(report.mutators[mutant.mutator]!.id)}
      </td>
      <td class="left change-cell">${renderChange(file.source, mutant)}</td>
      <td>${tests}</td>
      <td class="dim">${escapeHtml(formatTime(mutant.duration))}</td>
      <td class="dim">${mutant.id.slice(0, report.meta.idLength)}</td>
    </tr>`
  })
  let widths = [
    measureColumn(
      index.mutants.map(
        mutant =>
          `${index.files[mutant.file]!.path}:${mutant.line}:${mutant.column}`,
      ),
      'Location',
      MAX_LOCATION,
    ),
    measureColumn(
      index.mutants.map(mutant => describeStatus(mutant.status).label),
      'Status',
    ) + DOT,
    measureColumn(
      index.mutants.map(mutant => report.mutators[mutant.mutator]!.id),
      'Mutator',
      MAX_MUTATOR,
    ),
    null,
    measureColumn(
      index.mutants.map(mutant =>
        String(mutant.coveredBy?.length ?? mutant.reach!),
      ),
      'Tests',
    ),
    measureColumn(
      index.mutants.map(mutant => formatTime(mutant.duration)),
      'Time',
    ),
    measureColumn(
      index.mutants.map(mutant => mutant.id.slice(0, report.meta.idLength)),
      'Id',
    ),
  ]
  let layout = getTableLayout(widths, MIN_CHANGE)
  let rest = matched.length - Math.min(limit, matched.length)
  let more =
    rest > 0 ?
      html`<p class="table-note">
        <button
          class="text-button"
          type="button"
          data-more
        >
          Show more · ${rest} left
        </button>
      </p>`
    : ''
  return html`<table
      class="table fixed"
      style="${layout.style}"
    >
      ${layout.colgroup}
      <thead>
        <tr>
          <th scope="col">Location</th>
          <th
            scope="col"
            class="left"
          >
            Status
          </th>
          <th
            scope="col"
            class="left"
          >
            Mutator
          </th>
          <th
            scope="col"
            class="left"
          >
            Change
          </th>
          <th scope="col">Tests</th>
          <th scope="col">Time</th>
          <th scope="col">Id</th>
        </tr>
      </thead>
      <tbody>
        ${rows.join('')}
      </tbody>
    </table>
    ${more}`
}
