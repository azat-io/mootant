import type { ReportIndex } from '../../../types/html/report-index'
import type { RunStatus } from '../../../types/run/run-status'

import { pluralize } from '../../../core/text/pluralize'
import { renderMutantRow } from './render-mutant-row'
import { filterByStatus } from './filter-by-status'
import { formatScore } from './format-score'
import { escapeHtml } from './escape-html'
import { html } from './html'

/**
 * Most files the list shows before it points to the rest.
 */
const MAX_FILES = 6

/**
 * Most mutants a file shows before it points to the rest.
 */
const MAX_MUTANTS = 6

/**
 * Renders the mutants to act on, by file, the lowest score first: a heading
 * with the counts and score of each file and its first mutants, then a link to
 * the rest of the file and one to the files left out.
 *
 * @param index - Index of the report.
 * @param filter - Status to show, or `all` for every mutant to act on.
 * @returns HTML of the groups.
 */
export function renderAttention(
  index: ReportIndex,
  filter: RunStatus | 'all',
): string {
  let groups = index.worstFiles
    .map(file => ({
      mutants: filterByStatus(file.actionable, filter),
      file,
    }))
    .filter(group => group.mutants.length > 0)
  let hidden = groups.slice(MAX_FILES)
  let hiddenMutants = hidden.reduce(
    (sum, group) => sum + group.mutants.length,
    0,
  )
  let markup = groups
    .slice(0, MAX_FILES)
    .map(({ mutants, file }) => {
      let { counts } = file
      let parts = [
        counts.Survived > 0 ?
          `${counts.Survived} of ${file.mutants.length} survived`
        : '',
        counts.NoCoverage > 0 ? `${counts.NoCoverage} without coverage` : '',
        counts.Error > 0 ? pluralize(counts.Error, 'error') : '',
      ].filter(Boolean)
      let shown = mutants.slice(0, MAX_MUTANTS)
      let rest = mutants[MAX_MUTANTS]
      return html`<div class="group">
        <div class="group-head">
          <span class="path">${escapeHtml(file.path)}</span
          ><span class="aside"
            >${parts.join(', ')} · score ${formatScore(file.score)}</span
          ><a
            class="open"
            href="#/mutant/${mutants[0]!.id}"
            >Open file ›</a
          >
        </div>
        ${shown.map(mutant => renderMutantRow(index, mutant)).join('')}${
          rest ?
            html`<a
              class="more-row"
              href="#/mutant/${rest.id}"
              >${mutants.length - MAX_MUTANTS} more in this file ›</a
            >`
          : ''
        }
      </div>`
    })
    .join('')
  if (hidden.length > 0) {
    markup += html`<a
      class="more-row group-more"
      href="#/mutants"
      >${pluralize(hiddenMutants, 'more mutant')} in
      ${pluralize(hidden.length, 'more file')} ›</a
    >`
  }
  return markup
}
