import type { ReportIndex } from '../../../types/html/report-index'

import { pluralize } from '../../../core/text/pluralize'
import { renderCountCells } from './render-count-cells'
import { renderStatusBar } from './render-status-bar'
import { formatScore } from './format-score'
import { escapeHtml } from './escape-html'
import { html } from './html'

/**
 * Renders the page of mutators, the lowest score first: each with its
 * description, a bar of the statuses of its mutants, its score, counts and
 * skipped candidates, then the mutators without mutants in the run. A row lists
 * the mutants of the mutator.
 *
 * @param index - Index of the report.
 * @returns HTML of the page.
 */
export function renderMutatorsView(index: ReportIndex): string {
  let active = index.mutators
    .filter(mutator => mutator.mutants > 0)
    .toSorted(
      (first, second) =>
        (first.score ?? 101) - (second.score ?? 101) ||
        second.counts.Survived - first.counts.Survived ||
        first.id.localeCompare(second.id),
    )
  let idle = index.mutators.filter(mutator => mutator.mutants === 0)
  let rows = active
    .map(
      mutator =>
        html`<tr data-mutator="${escapeHtml(mutator.id)}">
          <th
            scope="row"
            class="text-cell"
          >
            <a
              class="name"
              href="#/mutants"
              data-mutator="${escapeHtml(mutator.id)}"
              ><code>${escapeHtml(mutator.id)}</code></a
            ><span class="description">${escapeHtml(mutator.description)}</span>
          </th>
          <td class="bar-cell">${renderStatusBar(mutator.counts, true)}</td>
          <td class="name">${formatScore(mutator.score)}</td>
          <td>${mutator.mutants}</td>
          ${renderCountCells(mutator.counts)}
          <td class="dim">
            ${mutator.skipped === 0 ? '<span class="zero">–</span>' : mutator.skipped}
          </td>
        </tr>`,
    )
    .join('')
  let note =
    idle.length === 0 ?
      ''
    : html`<p class="table-note">
        No mutants in this run:
        ${idle.map(mutator => html`<b>${escapeHtml(mutator.id)}</b>`).join(', ')}.
      </p>`
  return html`<div class="page container">
    <div class="section-head">
      <div>
        <h1 class="title">Mutators</h1>
        <p class="lead">
          Lowest score first. A mutator that keeps surviving is a blind spot of
          the suite: a boundary no test asserts, a value nobody compares.
          Skipped counts the changes it considered and left out.
        </p>
      </div>
      <span class="aside"
        >${pluralize(active.length, 'mutator')} ·
        ${pluralize(index.mutants.length, 'mutant')}</span
      >
    </div>
    <div class="card table-wrap">
      <table class="table">
        <thead>
          <tr>
            <th scope="col">Mutator</th>
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
            <th scope="col">Skipped</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
      ${note}
    </div>
  </div>`
}
