/**
 * Makes the color codes of a text visible, so tests can compare colored output
 * as readable text: every code such as `ESC[90m` becomes `<90>`.
 *
 * @param text - Text with color codes.
 * @returns The same text with the codes spelled out.
 */
export function showEscapes(text: string): string {
  let [first = '', ...rest] = text.split('\u{1B}[')
  return [
    first,
    ...rest.map(part => part.replace(/^(?<code>\d+)m/u, '<$<code>>')),
  ].join('')
}
