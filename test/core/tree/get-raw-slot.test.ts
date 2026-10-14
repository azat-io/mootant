import { describe, expect, it } from 'vitest'

import { createTestFile } from '../../helpers/create-test-file'
import { getRawSlot } from '../../../core/tree/get-raw-slot'

describe('getRawSlot', () => {
  it('returns the own slot of a node inside parentheses', () => {
    let { find, tree } = createTestFile('f((a))')

    expect(getRawSlot(tree, find('Identifier', 'a'))).toMatchObject({
      parent: { type: 'ParenthesizedExpression' },
      key: 'expression',
      index: null,
    })
  })

  it('returns the index of a list element', () => {
    let { find, tree } = createTestFile('f(b, a)')

    expect(getRawSlot(tree, find('Identifier', 'a'))).toMatchObject({
      parent: { type: 'CallExpression' },
      key: 'arguments',
      index: 1,
    })
  })

  it('returns an empty slot for the program', () => {
    let { find, tree } = createTestFile('a')

    expect(getRawSlot(tree, find('Program'))).toStrictEqual({
      parent: null,
      index: null,
      key: null,
    })
  })

  it('throws for a node outside the runtime tree', () => {
    let { tree } = createTestFile('a')
    let other = createTestFile('a')

    expect(() => getRawSlot(tree, other.find('Identifier', 'a'))).toThrow(
      new Error('Node is not part of the runtime tree of the file.'),
    )
  })
})
