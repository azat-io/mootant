import { describe, expect, it } from 'vitest'

import { readRegexCall } from '../../../core/regex/read-regex-call'
import { createTestFile } from '../../helpers/create-test-file'

/**
 * Reads the first call or `new` expression of a snippet.
 *
 * @param source - Text of the snippet.
 * @returns The call as read, or null.
 */
function read(source: string): ReturnType<typeof readRegexCall> {
  let file = createTestFile(source)
  let type =
    source.includes('new ') ?
      ('NewExpression' as const)
    : ('CallExpression' as const)
  return readRegexCall(file.find(type), file)
}

describe('readRegexCall', () => {
  it('reads a call with a string pattern and string flags', () => {
    let file = createTestFile("x = new RegExp('a', 'gi')")
    let call = file.find('NewExpression')

    expect(readRegexCall(call, file)).toStrictEqual({
      flagsNode: file.find('Literal', "'gi'"),
      pattern: file.find('Literal', "'a'"),
      flags: 'gi',
      call,
    })
  })

  it('reads a call without flags', () => {
    expect(read("x = RegExp('a')")).toMatchObject({
      flagsNode: null,
      flags: '',
    })
  })

  it.each([
    `x = RegExp(\`a\${b}\`, \`g\`)`,
    'x = RegExp(String.raw`a`)',
    "x = (RegExp)(('a' as string))",
    'x = RegExp(`a`)',
  ])('reads %s', source => {
    expect(read(source)).not.toBeNull()
  })

  it.each([
    "let RegExp = f\nx = RegExp('a')",
    "x = Foo('a')",
    "x = window.RegExp('a')",
    'x = RegExp()',
    "x = RegExp('a', 'g', 1)",
    'x = RegExp(...a)',
    "x = RegExp('a', ...f)",
    "x = RegExp('a', f)",
    `x = RegExp(\`a\`, \`\${g}\`)`,
    "x = RegExp('a', 1)",
    'x = RegExp(a)',
    'x = RegExp(1)',
    'x = RegExp(/a/)',
    `x = RegExp(String.raw\`a\${b}\`)`,
    'x = RegExp(String.cooked`a`)',
    'x = RegExp(String[raw]`a`)',
    'let String = f\nx = RegExp(String.raw`a`)',
    'x = RegExp(raw`a`)',
  ])('skips %s', source => {
    expect(read(source)).toBeNull()
  })

  it('skips another node', () => {
    let file = createTestFile('x = a')

    expect(readRegexCall(file.find('Identifier', 'a'), file)).toBeNull()
  })
})
