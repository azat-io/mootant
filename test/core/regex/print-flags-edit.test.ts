import { describe, expect, it } from 'vitest'

import type { RegexSource } from '../../../types/regex/regex-source'

import { readRegexArgument } from '../../../core/regex/read-regex-argument'
import { readRegexLiteral } from '../../../core/regex/read-regex-literal'
import { printFlagsEdit } from '../../../core/regex/print-flags-edit'
import { readRegexCall } from '../../../core/regex/read-regex-call'
import { createTestFile } from '../../helpers/create-test-file'

/**
 * Reads the regular expression of `x = <expression>`.
 *
 * @param expression - Text of a literal or a `new RegExp` call.
 * @returns The regular expression as read.
 */
function read(expression: string): RegexSource {
  let file = createTestFile(`x = ${expression}`)
  if (expression.startsWith('/')) {
    return readRegexLiteral(file.find('Literal'), file.sourceCode.text)!
  }
  let call = readRegexCall(file.find('NewExpression'), file)!
  return readRegexArgument(call, file.sourceCode.text)!
}

describe('printFlagsEdit', () => {
  it('prints a literal with new flags', () => {
    let source = read('/a/gi')

    expect(printFlagsEdit(source, 'g')).toStrictEqual({
      focus: { text: 'g', start: 7, end: 9 },
      node: source.node,
      text: '/a/g',
    })
  })

  it('prints the flags argument with its quote', () => {
    let source = read('new RegExp(`a`, "gi")')

    expect(printFlagsEdit(source, 'i')).toStrictEqual({
      focus: { start: 21, text: 'i', end: 23 },
      node: source.flagsNode,
      text: '"i"',
    })
  })

  it('adds the flags to a call with a string pattern', () => {
    let source = read('new RegExp(("a"),)')

    expect(printFlagsEdit(source, 'g')).toStrictEqual({
      focus: { text: ', "g"', start: 20, end: 20 },
      text: 'new RegExp(("a"), "g",)',
      node: source.expression,
    })
  })

  it('adds the flags with single quotes to a call with a template', () => {
    expect(printFlagsEdit(read('new RegExp(`a`)'), 'i').text).toBe(
      "new RegExp(`a`, 'i')",
    )
  })
})
