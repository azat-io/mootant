import { escapeHtml } from './escape-html'
import { html } from './html'

/**
 * Renders the full name of a test with its suites muted and its own name in
 * bold.
 *
 * @param name - Full name, suites joined by `>`.
 * @returns HTML of the name.
 */
export function renderTestName(name: string): string {
  let parts = name.split(' > ')
  let own = parts.pop()!
  let suites =
    parts.length === 0 ?
      ''
    : html`<span class="suite">${escapeHtml(parts.join(' › '))} › </span>`
  return html`<span class="test-name">${suites}<b>${escapeHtml(own)}</b></span>`
}
