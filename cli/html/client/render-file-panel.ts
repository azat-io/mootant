import type { ReportIndex } from '../../../types/html/report-index'
import type { IndexedFile } from '../../../types/html/indexed-file'

import { pluralize } from '../../../core/text/pluralize'
import { renderStatusBar } from './render-status-bar'
import { escapeHtml } from './escape-html'
import { html } from './html'

/**
 * Renders the panel of a file when no mutant is selected: what to look at, the
 * bar of its statuses, its mutators with their survivors, and its skipped
 * candidates by category.
 *
 * @param index - Index of the report.
 * @param file - File shown.
 * @returns HTML of the panel.
 */
export function renderFilePanel(index: ReportIndex, file: IndexedFile): string {
  let mutators = new Map<number, { survived: number; total: number }>()
  for (let mutant of file.mutants) {
    let entry = mutators.get(mutant.mutator) ?? { survived: 0, total: 0 }
    entry.total += 1
    entry.survived += Number(mutant.status === 'Survived')
    mutators.set(mutant.mutator, entry)
  }
  let categories = new Map<string, number>()
  for (let entry of file.skipped) {
    categories.set(entry.category, (categories.get(entry.category) ?? 0) + 1)
  }
  let advice =
    file.actionable.length > 0 ?
      html`${pluralize(file.actionable.length, 'mutant')} to look at. Press
        <kbd>j</kbd> for the first one.`
    : 'Every mutant of this file is detected.'
  let mutatorRows = [...mutators]
    .sort(
      ([, first], [, second]) =>
        second.survived - first.survived || second.total - first.total,
    )
    .map(
      ([mutator, { survived, total }]) =>
        html`<dt>
            <code title="${escapeHtml(index.report.mutators[mutator]!.id)}"
              >${escapeHtml(index.report.mutators[mutator]!.id)}</code
            >
          </dt>
          <dd>
            ${total}${
              survived > 0 ?
                html`<span
                  class="tally status-survived"
                  title="${survived} survived"
                  >${survived}</span
                >`
              : ''
            }
          </dd>`,
    )
    .join('')
  let skipped =
    categories.size === 0 ?
      ''
    : html`<div class="panel-section">
        <span class="label">Left out here</span>
        <dl class="fields">
          ${[...categories]
            .map(
              ([category, count]) =>
                html`<dt>${category}</dt>
                  <dd>${count}</dd>`,
            )
            .join('')}
        </dl>
      </div>`
  return html`<div class="card panel-card">
    <div class="panel-section">
      <span class="label">File</span>
      <p class="advice">${advice}</p>
      ${renderStatusBar(file.counts)}
    </div>
    ${
      mutatorRows ?
        html`<div class="panel-section">
          <span class="label">Mutators here</span>
          <dl class="fields mutator-fields">${mutatorRows}</dl>
        </div>`
      : ''
    }${skipped}
  </div>`
}
