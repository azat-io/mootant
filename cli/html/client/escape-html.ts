/**
 * Escapes text for HTML, in element content and in quoted attribute values.
 *
 * @param text - Text or number to show.
 * @returns Text with `&`, `<`, `>` and `"` escaped.
 */
export function escapeHtml(text: number | string): string {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}
