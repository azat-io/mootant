import type { SkipCategory } from '../../../types/mutant/skip-category'
import type { ReportIndex } from '../../../types/html/report-index'

import { escapeHtml } from './escape-html'
import { getIcon } from './get-icon'
import { html } from './html'

/**
 * What each category of skips means.
 */
const MEANINGS: Record<SkipCategory, string> = {
  subsumed:
    'A mutant that runs covers it: a test that kills that one kills this one too.',
  equivalent: 'It cannot change what the code does, so no test could kill it.',
  noise: 'It only changes details no test should pin, such as message text.',
  timeout: 'Only a timeout could kill it: a long run that proves little.',
  owned: 'Another mutator makes the same change under its own name.',
  invalid: 'The change cannot be switched on in this place.',
  duplicate: 'It produces the same code as another mutant.',
}

/**
 * Icon of each category of skips.
 */
const ICONS: Record<SkipCategory, Parameters<typeof getIcon>[0]> = {
  timeout: 'hourglass',
  equivalent: 'equal',
  noise: 'volume-off',
  subsumed: 'stack-2',
  duplicate: 'copy',
  invalid: 'ban',
  owned: 'crown',
}

/**
 * Most reasons a category shows.
 */
const MAX_REASONS = 2

/**
 * Renders the summary of the skipped candidates: how many changes were
 * considered and run, and a card for each category of skips, the largest first,
 * with what it means and its most common reasons with their rules.
 *
 * @param index - Index of the report.
 * @returns HTML of the section, or an empty string without skipped candidates.
 */
export function renderSkippedSummary(index: ReportIndex): string {
  let { skipped, texts } = index.report
  if (skipped.length === 0) {
    return ''
  }
  let categories = new Map<SkipCategory, Map<string, number>>()
  for (let entry of skipped) {
    let reasons = categories.get(entry.category) ?? new Map<string, number>()
    let key = `${entry.rule}\0${texts[entry.reason]}`
    reasons.set(key, (reasons.get(key) ?? 0) + 1)
    categories.set(entry.category, reasons)
  }
  let cards = [...categories]
    .map(([category, reasons]) => ({
      count: [...reasons.values()].reduce((sum, count) => sum + count, 0),
      category,
      reasons,
    }))
    .sort((first, second) => second.count - first.count)
    .map(({ category, reasons, count }) => {
      let common = [...reasons]
        .sort((first, second) => second[1] - first[1])
        .slice(0, MAX_REASONS)
        .map(([key, reasonCount]) => {
          let [rule, reason] = key.split('\0') as [string, string]
          return html`<li>
            <span class="reason-count">${reasonCount}</span
            ><span
              >${escapeHtml(reason.charAt(0).toUpperCase() + reason.slice(1))}
              <span class="rule">${escapeHtml(rule)}</span></span
            >
          </li>`
        })
        .join('')
      return html`<div class="card skip-card">
        <div class="skip-head">
          ${getIcon(ICONS[category])}
          <h3>${category}</h3>
          <strong class="skip-count">${count}</strong>
        </div>
        <p class="skip-text">${MEANINGS[category]}</p>
        <ul class="skip-reasons">
          ${common}
        </ul>
      </div>`
    })
  let total = index.mutants.length + skipped.length
  return html`<section
    class="section"
    id="skipped"
    aria-labelledby="skipped-title"
  >
    <div class="section-head">
      <div>
        <h2
          class="title"
          id="skipped-title"
        >
          Left out on purpose
        </h2>
        <p class="lead">
          Mootant considered ${total.toLocaleString('en-US')} changes and ran
          ${index.mutants.length.toLocaleString('en-US')}. The other
          ${skipped.length.toLocaleString('en-US')} would repeat a mutant that
          runs, change nothing, or cost a run without telling anything. Each has
          a rule and a reason: turn on “Skipped” in a file to see them in place.
        </p>
      </div>
    </div>
    <div class="skips">${cards.join('')}</div>
  </section>`
}
