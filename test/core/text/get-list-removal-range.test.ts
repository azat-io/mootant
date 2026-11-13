import type { ExpressionStatement } from 'oxc-parser'

import { describe, expect, it } from 'vitest'

import type { ListExpression } from '../../../types/syntax/list-expression'
import type { ParsedFile } from '../../../types/source/parsed-file'

import { getListRemovalRange } from '../../../core/text/get-list-removal-range'
import { unwrapExpression } from '../../../core/tree/unwrap-expression'
import { createTestFile } from '../../helpers/create-test-file'

/**
 * Reads the list expression of the first statement, through parentheses.
 *
 * @param parsed - Parsed file whose first statement is an expression statement.
 * @returns The array, object, call or `new` expression.
 */
function getList(parsed: ParsedFile): ListExpression {
  let [statement] = parsed.program.body
  return unwrapExpression(
    (statement as ExpressionStatement).expression,
  ) as ListExpression
}

describe('getListRemovalRange', () => {
  it.each([
    ['[a, b, c]', 0, 'a, '],
    ['[a, b, c]', 1, 'b, '],
    ['[a, b, c]', 2, ', c'],
    ['[a, b,]', 1, ' b,'],
    ['[a, b ,]', 1, ', b'],
    ['[ a ]', 0, ' a '],
    ['[a /* c */, b]', 0, 'a /* c */, '],
    ['[a /* c */, b]', 1, ', b'],
    ['({ a: 1, b })', 1, ', b'],
    [['[', '  a,', '  b,', ']'].join('\n'), 0, 'a,\n  '],
    [['[', '  a,', '  b,', ']'].join('\n'), 1, '\n  b,'],
    [['[', '  a,', '  b', ']'].join('\n'), 1, ',\n  b'],
    ['f(a, b)', 0, 'a, '],
    ['[a, , b]', 0, 'a, '],
    ['[, a]', 1, ' a'],
    ['[, a,]', 1, ' a,'],
  ])(
    'finds the text removing from %j the element %i deletes',
    (source, index, expected) => {
      let { parsed } = createTestFile(source)
      let { start, end } = getListRemovalRange(parsed, getList(parsed), index)

      expect(source.slice(start, end)).toBe(expected)
    },
  )

  it.each([
    ['a hole', '[a, , b]', 1],
    ['an index past the end', '[a, b]', 2],
  ])('rejects %s', (_description, source, index) => {
    let { parsed } = createTestFile(source)

    expect(() => getListRemovalRange(parsed, getList(parsed), index)).toThrow(
      new RangeError(`List element ${index} does not exist.`),
    )
  })
})
