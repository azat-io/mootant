import { describe, expect, it } from 'vitest'

import { readRegexLiteral } from '../../../core/regex/read-regex-literal'
import { createTestFile } from '../../helpers/create-test-file'

describe('readRegexLiteral', () => {
  it('reads the pattern, flags, offsets and tree of a literal', () => {
    let { sourceCode, find } = createTestFile(String.raw`x = /a\/b/gi`)
    let node = find('Literal')

    expect(readRegexLiteral(node, sourceCode.text)).toMatchObject({
      tree: { raw: String.raw`a\/b`, type: 'Pattern' },
      pattern: String.raw`a\/b`,
      offsets: [5, 6, 7, 8, 9],
      expression: node,
      form: 'literal',
      flagsNode: null,
      dynamic: false,
      flags: 'gi',
      node,
    })
  })

  it('skips a literal that is not a regular expression', () => {
    let { sourceCode, find } = createTestFile("x = 'a'")

    expect(readRegexLiteral(find('Literal'), sourceCode.text)).toBeNull()
  })

  it('skips another node', () => {
    let { sourceCode, find } = createTestFile('x = a')

    expect(
      readRegexLiteral(find('Identifier', 'a'), sourceCode.text),
    ).toBeNull()
  })

  it('skips a literal that does not compile', () => {
    let { sourceCode, find } = createTestFile('x = /(/', 'example.js')

    expect(readRegexLiteral(find('Literal'), sourceCode.text)).toBeNull()
  })

  it('skips a pattern regexpp cannot parse', () => {
    let { find } = createTestFile('x = /a/')

    expect(readRegexLiteral(find('Literal'), 'x = /(/')).toBeNull()
  })
})
