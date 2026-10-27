import type { ReportIndex } from '../../../types/html/report-index'
import type { IndexedFile } from '../../../types/html/indexed-file'
import type { IndexedSkip } from '../../../types/html/indexed-skip'

import { describeStatus } from './describe-status'
import { renderChange } from './render-change'
import { escapeHtml } from './escape-html'
import { renderDiff } from './render-diff'
import { getIcon } from './get-icon'
import { html } from './html'

/**
 * Renders the panel of a skipped candidate: why there is no mutant here, with
 * its category, mutator, rule and reason, the mutant that justifies the skip,
 * the change it would make, and the mutants that run at the same place.
 *
 * @param index - Index of the report.
 * @param file - File of the candidate.
 * @param skip - Skipped candidate to show.
 * @returns HTML of the panel.
 */
export function renderSkipPanel(
  index: ReportIndex,
  file: IndexedFile,
  skip: IndexedSkip,
): string {
  let { mutators, texts } = index.report
  let reason = texts[skip.reason]!
  let justifier = skip.by?.id ? index.byId.get(skip.by.id) : undefined
  let place =
    skip.by ?
      html`<code>${escapeHtml(skip.by.mutator)}</code> at
        ${skip.by.line}:${skip.by.column}`
    : ''
  let by =
    skip.by ?
      html`<dt>covered by</dt>
        <dd>
          ${
            justifier ?
              html`<a href="#/mutant/${justifier.id}">${place}</a> ·
                ${describeStatus(justifier.status).label}`
            : place
          }
        </dd>`
    : ''
  let near = file.mutants.filter(
    mutant =>
      mutant.start < Math.max(skip.end, skip.start + 1) &&
      skip.start < Math.max(mutant.end, mutant.start + 1),
  )
  let running =
    near.length === 0 ?
      ''
    : html`<div class="panel-section">
        <span class="label">Mutants that run here</span>
        <ul class="also">
          ${near
            .map(mutant => {
              let status = describeStatus(mutant.status)
              return html`<li>
                <a
                  class="also-link"
                  href="#/mutant/${mutant.id}"
                  ><span class="dot status-${status.key}"></span
                  ><span class="grow"
                    ><code>${escapeHtml(mutators[mutant.mutator]!.id)}</code>
                    ${renderChange(file.source, mutant)}</span
                  ><span class="muted">${status.label}</span></a
                >
              </li>`
            })
            .join('')}
        </ul>
      </div>`
  return html`<div class="card panel-card is-detail">
    <div class="panel-section">
      <div class="panel-head">
        <span class="label">Left out on purpose</span
        ><span class="status status-skipped">${skip.category}</span>
        <div class="nav-buttons">
          <button
            class="icon-button panel-close"
            type="button"
            data-close-panel
            aria-label="Close details"
          >
            ${getIcon('cross')}
          </button>
        </div>
      </div>
      <span class="where">line ${skip.line}:${skip.column}</span>
    </div>
    <div class="panel-section">
      <dl class="fields">
        <dt>mutator</dt>
        <dd><code>${escapeHtml(mutators[skip.mutator]!.id)}</code></dd>
        <dt>rule</dt>
        <dd>
          <code>${escapeHtml(skip.rule)}</code
          >${skip.heuristic ? ' · a guess, not a proof' : ''}
        </dd>
        <dt>why</dt>
        <dd>
          ${escapeHtml(reason.charAt(0).toUpperCase() + reason.slice(1))}.
        </dd>
        ${by}
      </dl>
    </div>
    <div class="panel-section">
      <span class="label">Change it would make</span>
      <div class="diff">
        <div class="diff-lines">
          ${renderDiff(file.source, file.lineStarts, skip)}
        </div>
      </div>
    </div>
    ${running}
  </div>`
}
