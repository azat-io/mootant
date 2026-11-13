import type {
  ExpressionStatement,
  MethodDefinition,
  ReturnStatement,
  Class,
  Node,
} from 'oxc-parser'

import { parseSync } from 'oxc-parser'

/**
 * Text before the expression in a `method` context: the value an async
 * generator method returns, so `await`, `yield`, `super` and `new.target` are
 * expressions there too.
 */
const PREFIX = 'class Expression { async *read() { return ('

/**
 * Text after the expression in a `method` context.
 */
const SUFFIX = ') } }'

/**
 * Parses the text of a single expression, such as the text of a replacement, in
 * parentheses. In a `method` context the text is the value that an async
 * generator method of a module returns, so `await`, `yield`, `super`,
 * `new.target` and `import.meta` parse as they do there. The source type is set
 * to module rather than detected: oxc, which takes a text with `import.meta`
 * for a module, reads a regular expression that starts with `<!--` right after
 * a `(` of a detected module as an HTML comment. In a `script` context the text
 * is a statement of a sloppy script, where `await` and `yield` are names. A
 * text that closes the parentheses and adds a statement or a member is not one
 * expression.
 *
 * @param text - Source text of the expression, without parentheses.
 * @param lang - Language of the expression.
 * @param context - Where the text is read; `method` when omitted.
 * @returns The expression in parentheses, or null when the text does not parse
 *   as one expression.
 */
export function parseExpression(
  text: string,
  lang: 'tsx' | 'jsx' | 'js' | 'ts',
  context: 'method' | 'script' = 'method',
): Node | null {
  if (context === 'script') {
    let { program, errors } = parseSync(`expression.${lang}`, `(${text})`, {
      sourceType: 'script',
      preserveParens: true,
      lang,
    })
    if (errors.length > 0 || program.body.length !== 1) {
      return null
    }
    let [statement] = program.body as [ExpressionStatement]
    return statement.expression
  }
  let { program, errors } = parseSync(
    `expression.${lang}`,
    `${PREFIX}${text}${SUFFIX}`,
    { sourceType: 'module', preserveParens: true, lang },
  )
  if (errors.length > 0 || program.body.length !== 1) {
    return null
  }
  let [declaration] = program.body as [Class]
  let members = declaration.body.body as MethodDefinition[]
  let statements = members[0]!.value.body!.body
  if (members.length !== 1 || statements.length !== 1) {
    return null
  }
  let [statement] = statements as [ReturnStatement]
  return statement.argument
}
