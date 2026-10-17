import type { ExpressionStatement, Node } from 'oxc-parser'

import { parseSync } from 'oxc-parser'

/**
 * Parses the text of a single expression, such as the text of a replacement.
 * The text is parsed in parentheses, so a text of one statement is always an
 * expression; a text that closes them and adds a statement is not one.
 *
 * @param text - Source text of the expression, without parentheses.
 * @param lang - Language of the expression.
 * @returns The expression in parentheses, or null when the text does not parse
 *   as one expression.
 */
export function parseExpression(text: string, lang: 'js' | 'ts'): Node | null {
  let { program, errors } = parseSync(`expression.${lang}`, `(${text})`, {
    preserveParens: true,
    lang,
  })
  if (errors.length > 0 || program.body.length !== 1) {
    return null
  }
  let [statement] = program.body as [ExpressionStatement]
  return statement.expression
}
