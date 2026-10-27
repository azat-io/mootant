import type { ReportIndex } from '../../../types/html/report-index'

import { renderStatusBar } from './render-status-bar'
import { getFileHref } from './get-file-href'
import { formatScore } from './format-score'
import { escapeHtml } from './escape-html'
import { formatTime } from './format-time'
import { html } from './html'

/**
 * Most entries of each list.
 */
const MAX_ENTRIES = 2

/**
 * Renders what the score alone does not tell: the mutators with the lowest
 * score, whose kind of change the tests check least, each with the bar of its
 * statuses, and the files whose isolated runs took the most time, each with its
 * share of that time; files that took none, as in a run from the cache, stay
 * out.
 *
 * @param index - Index of the report.
 * @returns HTML of the lists, or an empty string when neither has entries.
 */
export function renderSpotlight(index: ReportIndex): string {
  let mutators = index.mutators
    .filter(mutator => mutator.score !== null && mutator.score < 100)
    .toSorted(
      (first, second) =>
        first.score! - second.score! ||
        second.counts.Survived - first.counts.Survived,
    )
    .slice(0, MAX_ENTRIES)
    .map(
      mutator =>
        html`<li class="spotlight-entry">
          <a
            class="spotlight-name"
            href="#/mutants"
            data-mutator="${escapeHtml(mutator.id)}"
            >${escapeHtml(mutator.id)}</a
          >
          <span class="spotlight-value">${formatScore(mutator.score)}</span>
          ${renderStatusBar(mutator.counts, true)}
        </li>`,
    )
  let costs = index.report.summary.staticCost
    .filter(cost => cost.duration > 0)
    .toSorted((first, second) => second.duration - first.duration)
  let spent = Math.max(
    1,
    costs.reduce((sum, cost) => sum + cost.duration, 0),
  )
  let files = costs.slice(0, MAX_ENTRIES).map(cost => {
    let share = Math.round((cost.duration / spent) * 100)
    return html`<li class="spotlight-entry">
      <a
        class="spotlight-name"
        href="${getFileHref(cost.file)}"
        >${escapeHtml(cost.file)}</a
      >
      <span class="spotlight-value">${share}%</span>
      <span
        class="share"
        role="img"
        aria-label="${share}% of the isolated test time, ${escapeHtml(formatTime(cost.duration))}"
        ><span style="inline-size: ${share}%"></span
      ></span>
    </li>`
  })
  let lists = [
    ['weakest', 'Weakest mutators', mutators],
    ['time', 'Isolated test time', files],
  ] as const
  let sections = lists
    .filter(([, , entries]) => entries.length > 0)
    .map(
      ([key, title, entries]) =>
        html`<section aria-labelledby="${key}-title">
          <h3
            class="label"
            id="${key}-title"
          >
            ${title}
          </h3>
          <ul class="spotlight-list">
            ${entries.join('')}
          </ul>
        </section>`,
    )
    .join('')
  return sections === '' ? '' : html`<div class="spotlight">${sections}</div>`
}
