/**
 * Removes the white space next to tags and joins the rest into single spaces,
 * and writes self-closing tags as plain ones, so that markup compares the same
 * however the template that built it was formatted.
 *
 * @param markup - HTML to compare.
 * @returns The HTML without white space that formatting may add.
 */
export function squashHtml(markup: string): string {
  return markup
    .replaceAll(/\s+/gu, ' ')
    .replaceAll(/ ?\/?> ?/gu, '>')
    .replaceAll(' <', '<')
    .trim()
}
