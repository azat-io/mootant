import type { Node } from 'oxc-parser'

import type { MutatorVisitors } from '../../types/mutator/mutator-visitors'
import type { MutatorContext } from '../../types/mutator/mutator-context'
import type { Replacement } from '../../types/mutator/replacement'
import type { RegexSource } from '../../types/regex/regex-source'

import { readRegexArgument } from './read-regex-argument'
import { readRegexLiteral } from './read-regex-literal'
import { readRegexCall } from './read-regex-call'

/**
 * Builds the visitors of a regex mutator: they read a regular expression
 * literal, and a call of `RegExp`, with or without `new`, whose pattern and
 * flags are known (see `readRegexCall` and `readRegexArgument`), and pass every
 * regular expression they read on to the mutator.
 *
 * @param context - Mutator context of the file.
 * @param mutate - Turns a regular expression as read into replacements.
 * @returns Visitors of literals, calls and `new` expressions.
 */
export function createRegexVisitors(
  context: Pick<MutatorContext, 'sourceCode' | 'syntax'>,
  mutate: (source: RegexSource) => Replacement[],
): MutatorVisitors {
  let { sourceCode } = context

  /**
   * Reads the regular expression of a call of `RegExp`.
   *
   * @param node - Call or `new` expression.
   * @returns Replacements of the call.
   */
  function visitCall(node: Node): Replacement[] {
    let call = readRegexCall(node, context)
    let source = call && readRegexArgument(call, sourceCode.text)
    return source ? mutate(source) : []
  }

  return {
    Literal(node) {
      let source = readRegexLiteral(node, sourceCode.text)
      return source ? mutate(source) : []
    },
    CallExpression: visitCall,
    NewExpression: visitCall,
  }
}
