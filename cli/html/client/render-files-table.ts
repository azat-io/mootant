import type { ReportIndex } from '../../../types/html/report-index'

import { renderCountCells } from './render-count-cells'
import { renderStatusBar } from './render-status-bar'
import { getFileHref } from './get-file-href'
import { formatScore } from './format-score'
import { escapeHtml } from './escape-html'
import { formatTime } from './format-time'
import { html } from './html'

/**
 * Renders the table of files, the lowest score first: the path, a bar of the
 * statuses, the score, the counts and the time the isolated runs of its mutants
 * took. A row opens its file.
 *
 * @param index - Index of the report.
 * @returns HTML of the table.
 */
export function renderFilesTable(index: ReportIndex): string {
  let rows = index.worstFiles.map(file => {
    let href = getFileHref(file.path)
    return html`<tr data-href="${href}">
      <th scope="row">
        <a
          class="name"
          href="${href}"
          >${escapeHtml(file.path)}</a
        >
      </th>
      <td class="bar-cell">${renderStatusBar(file.counts, true)}</td>
      <td class="name">${formatScore(file.score)}</td>
      <td>${file.mutants.length}</td>
      ${renderCountCells(file.counts)}
      <td class="dim">
        ${file.cost ? escapeHtml(formatTime(file.cost.duration)) : '–'}
      </td>
    </tr>`
  })
  return html`<table class="table">
    <thead>
      <tr>
        <th scope="col">File</th>
        <th
          scope="col"
          class="left"
        >
          Mutants
        </th>
        <th scope="col">Score</th>
        <th scope="col">Total</th>
        <th scope="col">Killed</th>
        <th scope="col">Survived</th>
        <th scope="col">No cov.</th>
        <th scope="col">Other</th>
        <th scope="col">Test time</th>
      </tr>
    </thead>
    <tbody>
      ${rows.join('')}
    </tbody>
  </table>`
}
