import type { TSTypeAssertion, TSAsExpression } from 'oxc-parser'

import { describe, expect, it } from 'vitest'

import { getAssertedType } from '../../../core/hints/get-asserted-type'
import { createTestFile } from '../../helpers/create-test-file'
import { walkTree } from '../../../core/tree/walk-tree'

/**
 * Finds the type assertion of a snippet and the text of its asserted type.
 *
 * @param source - Text of the snippet; it holds one type assertion.
 * @returns Text of the asserted type, or null when the assertion keeps the
 *   operand's type.
 */
function getAssertedText(source: string): string | null {
  let { program, text } = createTestFile(source, 'example.ts').parsed
  let assertions: (TSTypeAssertion | TSAsExpression)[] = []
  walkTree(program, node => {
    if (node.type === 'TSAsExpression' || node.type === 'TSTypeAssertion') {
      assertions.push(node)
    }
    return true
  })
  let type = getAssertedType(assertions[0]!)
  return type ? text.slice(type.start, type.end) : null
}

describe('getAssertedType', () => {
  it.each([
    ['x as Foo', 'Foo'],
    ['<Foo>x', 'Foo'],
    ['x as string | null', 'string | null'],
    ['x as NS.const', 'NS.const'],
    ['x as const', null],
    ['<const>x', null],
  ])('finds the asserted type of %s', (source, expected) => {
    expect(getAssertedText(source)).toBe(expected)
  })
})
