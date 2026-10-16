import { parseSync } from 'oxc-parser'

import { walkTree } from '../tree/walk-tree'

/**
 * Escapes of the characters that a reprinted string cannot hold as they are.
 */
let escapes = new Map([
  ['\u{2028}', `${String.raw`\u`}2028`],
  ['\u{2029}', `${String.raw`\u`}2029`],
  ['"', String.raw`\x22`],
  ["'", String.raw`\x27`],
  ['\n', String.raw`\n`],
  ['\r', String.raw`\r`],
  ['\\', '\\\\'],
])

/**
 * Rewrites the string literals of an expression that are written with a given
 * quote in the other quote, so the expression can sit in an attribute value
 * delimited by that quote. Both quotes inside a rewritten string become `\x22`
 * and `\x27`. Other text is kept as written.
 *
 * @param text - Expression text.
 * @param quote - Quote to remove from the string literals.
 * @param lang - Language of the expression.
 * @returns The rewritten text, or the text as is when it does not parse as an
 *   expression.
 */
export function swapStringQuotes(
  text: string,
  quote: '"' | "'",
  lang: 'js' | 'ts',
): string {
  let { program, errors } = parseSync(`expression.${lang}`, `(${text})`, {
    lang,
  })
  if (errors.length > 0) {
    return text
  }
  let other = quote === '"' ? "'" : '"'
  let output = ''
  let cursor = 0
  walkTree(program, node => {
    if (
      node.type === 'Literal' &&
      typeof node.value === 'string' &&
      text[node.start - 1] === quote
    ) {
      let value = [...node.value]
        .map(character => escapes.get(character) ?? character)
        .join('')
      output += `${text.slice(cursor, node.start - 1)}${other}${value}${other}`
      cursor = node.end - 1
    }
    return true
  })
  return output + text.slice(cursor)
}
