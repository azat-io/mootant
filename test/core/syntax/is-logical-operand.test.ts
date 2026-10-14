import { describe, expect, it } from 'vitest'

import { isLogicalOperand } from '../../../core/syntax/is-logical-operand'
import { createTestFile } from '../../helpers/create-test-file'

describe('isLogicalOperand', () => {
  it.each([
    { source: 'a && b', expected: true },
    { source: 'b || (a)', expected: true },
    { source: '(a as T) ?? b', expected: true },
    { source: 'a + b', expected: false },
    { expected: false, source: '!a' },
  ])(
    'tells whether a is a logical operand in $source',
    ({ expected, source }) => {
      let { find, tree } = createTestFile(source)

      expect(isLogicalOperand(tree, find('Identifier', 'a'))).toBe(expected)
    },
  )

  it('returns false for the program', () => {
    let { find, tree } = createTestFile('a')

    expect(isLogicalOperand(tree, find('Program'))).toBe(false)
  })

  it('throws for a node outside the runtime tree', () => {
    let { tree } = createTestFile('a && b')
    let other = createTestFile('a && b')

    expect(() => isLogicalOperand(tree, other.find('Identifier', 'a'))).toThrow(
      'Node is not part of the runtime tree of the file.',
    )
  })
})
