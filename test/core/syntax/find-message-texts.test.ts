import { describe, expect, it } from 'vitest'

import { findMessageTexts } from '../../../core/syntax/find-message-texts'
import { createTestFile } from '../../helpers/create-test-file'

/**
 * Finds the texts of the value assigned to `x` in a snippet.
 *
 * @param source - Value of `x`.
 * @returns Source text of every range found.
 */
function find(source: string): string[] {
  let snippet = createTestFile(`x = ${source}`)
  let { text } = snippet.parsed
  return findMessageTexts(snippet.find('AssignmentExpression').right).map(
    range => text.slice(range.start, range.end),
  )
}

describe('findMessageTexts', () => {
  it.each([
    ["'a'", ["'a'"]],
    [`\`a \${b}\``, [`\`a \${b}\``]],
    [`'a' + f() + (\`b\` as string) + 1 + 'c'`, ["'a'", '`b`', "'c'"]],
    [`\`a \${b.c}\``, []],
    ["ok ? 'a' : 'b'", []],
    ["f('a')", []],
    ["'a' - 'b'", []],
    ['1', []],
  ])('finds the texts of %s', (source, expected) => {
    expect(find(source)).toStrictEqual(expected)
  })
})
