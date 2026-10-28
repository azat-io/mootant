import type { Mock } from 'vitest'

import { describe, expect, it, vi } from 'vitest'

import type { MutatorVisitors } from '../../../types/mutator/mutator-visitors'
import type { Replacement } from '../../../types/mutator/replacement'
import type { RegexSource } from '../../../types/regex/regex-source'
import type { TestFile } from '../../helpers/create-test-file'

import { createRegexVisitors } from '../../../core/regex/create-regex-visitors'
import { createTestFile } from '../../helpers/create-test-file'

/**
 * Visitors of a snippet with the mutator they pass regular expressions on to.
 */
interface VisitorSetup {
  /**
   * Mutator that gives every regular expression the same replacements.
   */
  mutate: Mock<(regex: RegexSource) => Replacement[]>

  /**
   * Replacements the mutator gives.
   */
  replacements: Replacement[]

  /**
   * Visitors under test.
   */
  visitors: MutatorVisitors

  /**
   * Parsed snippet.
   */
  file: TestFile
}

/**
 * Parses a snippet and creates the visitors of a regex mutator for it.
 *
 * @param source - Text of the snippet.
 * @returns The visitors, their mutator and its replacements, and the snippet.
 */
function setup(source: string): VisitorSetup {
  let file = createTestFile(source)
  let replacements: Replacement[] = [{ node: file.parsed.program, text: '' }]
  let mutate = vi.fn<(regex: RegexSource) => Replacement[]>(() => replacements)
  return {
    visitors: createRegexVisitors(file, mutate),
    replacements,
    mutate,
    file,
  }
}

describe('createRegexVisitors', () => {
  it('passes a regular expression literal on', () => {
    let { replacements, visitors, mutate, file } = setup('x = /a/g')
    let literal = file.find('Literal')

    expect(visitors.Literal!(literal, null)).toBe(replacements)
    expect(mutate).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ expression: literal, form: 'literal' }),
    )
  })

  it('skips a literal that is not a regular expression', () => {
    let { visitors, mutate, file } = setup("x = 'a'")

    expect(visitors.Literal!(file.find('Literal'), null)).toStrictEqual([])
    expect(mutate).not.toHaveBeenCalled()
  })

  it('passes the regular expression of a RegExp call on', () => {
    let { replacements, visitors, mutate, file } = setup("x = RegExp('a', 'g')")
    let call = file.find('CallExpression')

    expect(visitors.CallExpression!(call, null)).toBe(replacements)
    expect(mutate).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ expression: call, form: 'string', flags: 'g' }),
    )
  })

  it('passes the regular expression of a new RegExp with expressions on', () => {
    let { replacements, visitors, mutate, file } = setup(
      `x = new RegExp(\`a\${b}\`)`,
    )
    let call = file.find('NewExpression')

    expect(visitors.NewExpression!(call, null)).toBe(replacements)
    expect(mutate).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ expression: call, dynamic: true }),
    )
  })

  it.each(["x = f('a')", "x = RegExp('(')"])('skips the call of %s', source => {
    let { visitors, mutate, file } = setup(source)

    expect(
      visitors.CallExpression!(file.find('CallExpression'), null),
    ).toStrictEqual([])
    expect(mutate).not.toHaveBeenCalled()
  })
})
