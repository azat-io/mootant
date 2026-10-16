import { getDisplayWidth } from './get-display-width'

/**
 * Wraps plain text at spaces so every line fits the width; a word wider than
 * the width keeps a line of its own.
 *
 * @param text - Plain text on one line.
 * @param width - Most columns of a line.
 * @returns Lines of the text.
 */
export function wrapText(text: string, width: number): string[] {
  let lines: string[] = []
  let line = ''
  for (let word of text.split(' ')) {
    let next = line === '' ? word : `${line} ${word}`
    if (line !== '' && getDisplayWidth(next) > width) {
      lines.push(line)
      line = word
    } else {
      line = next
    }
  }
  lines.push(line)
  return lines
}
