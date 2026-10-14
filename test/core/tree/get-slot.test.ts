import { describe, expect, it } from 'vitest'

import { createTestFile } from '../../helpers/create-test-file'
import { getSlot } from '../../../core/tree/get-slot'

describe('getSlot', () => {
  it.each([
    { source: 'if ((a)) {}', parent: 'IfStatement', key: 'test', index: null },
    { parent: 'CallExpression', source: 'f((a))', key: 'arguments', index: 0 },
    { parent: 'CallExpression', source: 'f(b, a)', key: 'arguments', index: 1 },
    {
      parent: 'VariableDeclarator',
      source: 'let x = a',
      key: 'init',
      index: null,
    },
    {
      source: 'if ((a as T)) {}',
      parent: 'TSAsExpression',
      key: 'expression',
      index: null,
    },
  ])(
    'finds the slot of a in $source through parentheses',
    ({ source, parent, index, key }) => {
      let { tree, find } = createTestFile(source)

      let slot = getSlot(tree, find('Identifier', 'a'))

      expect(slot).toMatchObject({ parent: { type: parent }, index, key })
    },
  )

  it('returns the slot of the outermost parentheses', () => {
    let { tree, find } = createTestFile('f(((a)))')

    expect(getSlot(tree, find('Identifier', 'a'))).toStrictEqual(
      tree.slots.get(find('ParenthesizedExpression', '((a))')),
    )
  })

  it('returns an empty slot for the program', () => {
    let { tree, find } = createTestFile('a')

    expect(getSlot(tree, find('Program', 'a'))).toStrictEqual({
      parent: null,
      index: null,
      key: null,
    })
  })

  it('throws for a node outside the runtime tree', () => {
    let { tree } = createTestFile('a')
    let other = createTestFile('a')

    expect(() => getSlot(tree, other.find('Identifier', 'a'))).toThrow(
      new Error('Node is not part of the runtime tree of the file.'),
    )
  })
})
