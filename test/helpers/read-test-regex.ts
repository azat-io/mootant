import type { RegexSource } from '../../types/regex/regex-source'

import { readRegexArgument } from '../../core/regex/read-regex-argument'
import { readRegexLiteral } from '../../core/regex/read-regex-literal'
import { readRegexCall } from '../../core/regex/read-regex-call'
import { createTestFile } from './create-test-file'

/**
 * Reads the regular expression of `x = <expression>`: a literal, or the pattern
 * of a `RegExp` call with or without `new`.
 *
 * @param expression - Text of the literal or the call.
 * @returns The regular expression as read.
 */
export function readTestRegex(expression: string): RegexSource {
  let file = createTestFile(`x = ${expression}`)
  if (expression.startsWith('/')) {
    return readRegexLiteral(file.find('Literal'), file.sourceCode.text)!
  }
  let node = file.find(
    expression.startsWith('new') ? 'NewExpression' : 'CallExpression',
  )
  return readRegexArgument(readRegexCall(node, file)!, file.sourceCode.text)!
}
