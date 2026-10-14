import type { ExpressionStatement } from 'oxc-parser'

import { describe, expect, it } from 'vitest'

import type { ListExpression } from '../../../types/list-expression'
import type { ParsedFile } from '../../../types/parsed-file'

import { removeListElement } from '../../../core/text/remove-list-element'
import { unwrapExpression } from '../../../core/tree/unwrap-expression'
import { createTestFile } from '../../helpers/create-test-file'

/**
 * Reads the list expression of the first statement, through parentheses and an
 * optional chain.
 *
 * @param parsed - Parsed file whose first statement is an expression statement.
 * @returns The array, object, call or `new` expression.
 */
function getList(parsed: ParsedFile): ListExpression {
  let [statement] = parsed.program.body
  let expression = unwrapExpression(
    (statement as ExpressionStatement).expression,
  )
  return (
    expression.type === 'ChainExpression' ?
      expression.expression
    : expression) as ListExpression
}

describe('removeListElement', () => {
  it.each([
    ['[a, b, c]', 1, '[a, c]'],
    [['[', '  a,', '  b,', ']'].join('\n'), 0, ['[', '  b,', ']'].join('\n')],
    ['[a, , b]', 0, '[, b]'],
    ['[a /* c */, b]', 1, '[a /* c */]'],
    ['({ a: 1, b, ...c })', 1, '{ a: 1, ...c }'],
    ['({ a })', 0, '{}'],
    ['f?.(a, b)', 0, 'f?.(b)'],
    ['f<T>(a, (b))', 0, 'f<T>((b))'],
    ['new Foo(a, b,)', 1, 'new Foo(a,)'],
    [['f(a, // one', '  b)'].join('\n'), 0, 'f(b)'],
  ])('removes from %j the element %i', (source, index, expected) => {
    let { parsed } = createTestFile(source)

    expect(removeListElement(parsed, getList(parsed), index)).toBe(expected)
  })

  it.each([
    ['[ a ]', 0, '[]'],
    ['f( a, )', 0, 'f()'],
    ['[a, b, c]', 0, '[b, c]'],
    ['[a, b, c]', 2, '[a, b]'],
    ['[a, b]', 1, '[a]'],
    ['[a, b,]', 1, '[a,]'],
    [['[', '  a,', '  b,', ']'].join('\n'), 1, ['[', '  a,', ']'].join('\n')],
    ['({ a, get b() { return 1 }, c() {} })', 1, '{ a, c() {} }'],
    ['f(...a, b)', 0, 'f(b)'],
  ])('removes from %j the element %i', (source, index, expected) => {
    let { parsed } = createTestFile(source)

    expect(removeListElement(parsed, getList(parsed), index)).toBe(expected)
  })

  it.each([
    ['[a, , b]', 2, '[a, ,]'],
    ['[, a]', 1, '[,]'],
    ['[, , a]', 2, '[, ,]'],
    ['[a, , , b]', 3, '[a, , ,]'],
    ['[, a, b]', 1, '[, b]'],
    ['[a, , b, c]', 2, '[a, , c]'],
  ])(
    'keeps the holes of %j when removing element %i',
    (source, index, expected) => {
      let { parsed } = createTestFile(source)

      expect(removeListElement(parsed, getList(parsed), index)).toBe(expected)
    },
  )

  it.each([
    ['f /* ( */ (a, b)', 1, 'f /* ( */ (a)'],
    ['f?.<T>(a, b)', 1, 'f?.<T>(a)'],
    ['f?. (a, b)', 1, 'f?. (a)'],
    ['new Foo<T>(a)', 0, 'new Foo<T>()'],
    ['(f)(a, b)', 0, '(f)(b)'],
    ['f<T>() (a)', 0, 'f<T>() ()'],
  ])('finds the arguments of %j', (source, index, expected) => {
    let { parsed } = createTestFile(source)

    expect(removeListElement(parsed, getList(parsed), index)).toBe(expected)
  })

  it.each([
    ['a hole', '[a, , b]', 1],
    ['an index past the end', '[a, b]', 2],
    ['a negative index', '[a, b]', -1],
    ['a fractional index', '[a, b]', 0.5],
    ['an empty argument list', 'new Foo', 0],
  ])('rejects %s', (_description, source, index) => {
    let { parsed } = createTestFile(source)

    expect(() => removeListElement(parsed, getList(parsed), index)).toThrow(
      new RangeError(`List element ${index} does not exist.`),
    )
  })
})
