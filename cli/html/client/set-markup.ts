/**
 * Replaces the content of an element with markup of the report's renderers.
 * They escape every value of the report (`escapeHtml`), so the markup carries
 * no markup of the data, such as code or test names.
 *
 * @param element - Element whose content to replace.
 * @param markup - HTML from a renderer of the report.
 */
export function setMarkup(element: Element, markup: string): void {
  // eslint-disable-next-line unicorn/no-unsafe-dom-html -- Values are escaped.
  element.innerHTML = markup
}
