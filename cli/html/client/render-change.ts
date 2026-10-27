import { escapeHtml } from './escape-html'
import { html } from './html'

/**
 * Change to show on one line.
 */
interface Change {
  /**
   * Part of the range the change amounts to, when a mutator names one.
   */
  focus?: { replacement: string; start: number; end: number }

  /**
   * Text written in place of the range.
   */
  replacement: string

  /**
   * Offset of the first replaced code unit.
   */
  start: number

  /**
   * Offset just past the last replaced code unit.
   */
  end: number
}

/**
 * Longest text of either side of the change before it is cut.
 */
const MAX_LENGTH = 64

/**
 * Renders a change on one line as `before → after`, with runs of whitespace
 * folded: the whole range, or its focus when the range is long and the mutator
 * names one. A removal shows `removed`.
 *
 * @param source - Text of the file.
 * @param change - Range, replacement and focus of the change.
 * @returns HTML of the change.
 */
export function renderChange(source: string, change: Change): string {
  let before = fold(source.slice(change.start, change.end))
  let after = fold(change.replacement)
  if (before.length > MAX_LENGTH && change.focus) {
    before = fold(source.slice(change.focus.start, change.focus.end))
    after = fold(change.focus.replacement)
  }
  return html`<span class="change"
    ><span class="before">${escapeHtml(cut(before))}</span
    ><span
      class="arrow"
      aria-label="becomes"
      >→</span
    ><span class="after"
      >${after === '' ? '<span class="removed">removed</span>' : escapeHtml(cut(after))}</span
    ></span
  >`
}

/**
 * Cuts long text with an ellipsis.
 *
 * @param text - Code on one line.
 * @returns Text of at most `MAX_LENGTH` characters.
 */
function cut(text: string): string {
  return text.length > MAX_LENGTH ? `${text.slice(0, MAX_LENGTH - 1)}…` : text
}

/**
 * Folds runs of whitespace into single spaces.
 *
 * @param text - Code.
 * @returns Code on one line.
 */
function fold(text: string): string {
  return text.replaceAll(/\s+/gu, ' ').trim()
}
