import type { ReportIndex } from '../../../types/html/report-index'
import type { RunStatus } from '../../../types/run/run-status'
import type { FileView } from '../../../types/html/file-view'

import { renderStatusFilter } from './render-status-filter'
import { pluralize } from '../../../core/text/pluralize'
import { renderSidePanel } from './render-side-panel'
import { renderFileCode } from './render-file-code'
import { formatScore } from './format-score'
import { renderTree } from './render-tree'
import { escapeHtml } from './escape-html'
import { formatTime } from './format-time'
import { getIcon } from './get-icon'
import { html } from './html'

/**
 * Statuses of the filter, in its order.
 */
const FILTERS: RunStatus[] = [
  'Survived',
  'NoCoverage',
  'Error',
  'Killed',
  'Timeout',
  'Ignored',
]

/**
 * Renders the files page, laid out like a page of the docs guide: the file list
 * on the side, then the path, counts and score of the shown file, a filter by
 * status and a switch for the skipped candidates, its code with the legend, and
 * the panel of the selected mutant, of the selected skipped candidate, or of
 * the file.
 *
 * @param index - Index of the report.
 * @param view - What the page shows.
 * @returns HTML of the page.
 */
export function renderFilesView(index: ReportIndex, view: FileView): string {
  let { filter, file } = view
  let { counts } = file
  let filters = renderStatusFilter({
    total: file.mutants.length,
    attribute: 'data-filter',
    statuses: FILTERS,
    filter,
    counts,
  })
  let detected = counts.Killed + counts.Timeout
  let stats = [
    pluralize(file.mutants.length, 'mutant'),
    `${detected} killed`,
    counts.Survived > 0 ?
      html`<span class="hot">${counts.Survived} survived</span>`
    : '',
    counts.NoCoverage > 0 ? `${counts.NoCoverage} no coverage` : '',
    `score ${formatScore(file.score)}`,
    file.cost ? `test time ${escapeHtml(formatTime(file.cost.duration))}` : '',
  ]
    .filter(Boolean)
    .join(' · ')
  let toggle =
    file.skipped.length === 0 ?
      ''
    : html`<label class="toggle"
        ><input
          type="checkbox"
          data-show-skipped${view.showSkipped ? ' checked' : ''}
        />
        Skipped <span class="count">${file.skipped.length}</span></label
      >`
  return html`<div class="files-layout container">
    <nav
      class="tree sticky"
      aria-label="Files"
    >
      <label class="filter"
        >${getIcon('filter')}<input
          type="text"
          placeholder="Filter files"
          value="${escapeHtml(view.treeQuery)}"
          data-tree-filter
          aria-label="Filter files"
      /></label>
      <ul
        class="tree-list"
        id="tree"
      >
        ${renderTree(index.files, file, view.treeQuery)}
      </ul>
      <p class="tree-note">Filled badge: survived. Ringed: no coverage.</p>
    </nav>
    <section
      class="code-view"
      aria-labelledby="file-title"
    >
      <div class="file-head">
        <h1 id="file-title">
          ${file.directory ? html`<span class="directory">${escapeHtml(file.directory)}/</span>` : ''}${escapeHtml(file.name)}
        </h1>
        <span class="stats">${stats}</span>
      </div>
      <div class="file-tools">
        <div
          class="segmented"
          role="group"
          aria-label="Show mutants"
        >
          ${filters}
        </div>
        ${toggle}
      </div>
      <div
        class="code"
        id="code"
      >
        ${file.readable ? renderFileCode(index, view) : '<p class="empty">The file could not be read.</p>'}
      </div>
      <div class="code-legend">
        <span><span class="range range-survived">survived</span></span
        ><span><span class="range range-no-coverage">no coverage</span></span
        ><span><span class="range range-error">error</span></span
        ><span><span class="range range-skipped">skipped</span></span
        ><span
          >Killed mutants are counted in the gray badges; pick Killed to mark
          them.</span
        >
      </div>
    </section>
    <aside
      class="panel sticky"
      aria-label="Details"
      id="panel"
    >
      ${renderSidePanel(index, view)}
    </aside>
  </div>`
}
