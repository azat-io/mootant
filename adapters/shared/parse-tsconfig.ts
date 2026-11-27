import type { ExpressionStatement, Expression } from 'oxc-parser'

import { readFileSync } from 'node:fs'
import { parseSync } from 'oxc-parser'

/**
 * Byte order mark some editors put at the start of a file.
 */
const BYTE_ORDER_MARK = String.fromCodePoint(0xfe_ff)

/**
 * Parses a `tsconfig.json` file. The file is JSON with comments and trailing
 * commas, as TypeScript reads it, so it is parsed as a JavaScript expression.
 *
 * @param file - Absolute path of the file.
 * @returns Expression the file holds, or null when the file cannot be read or
 *   parsed or holds more than one.
 */
export function parseTsconfig(file: string): Expression | null {
  let text: string
  try {
    text = readFileSync(file, 'utf8')
  } catch {
    return null
  }
  let { program, errors } = parseSync(
    'tsconfig.js',
    `(\n${text.startsWith(BYTE_ORDER_MARK) ? text.slice(1) : text}\n)`,
    { preserveParens: false, lang: 'js' },
  )
  if (errors.length > 0 || program.body.length !== 1) {
    return null
  }
  let [statement] = program.body as [ExpressionStatement]
  return statement.expression
}
