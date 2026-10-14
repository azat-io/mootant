import { describe, expect, it } from 'vitest'

import { getContextSlot } from '../../../core/tree/get-context-slot'
import { createTestFile } from '../../helpers/create-test-file'

describe('getContextSlot', () => {
  it.each([
    {
      source: 'while ((a as boolean)) {}',
      parent: 'WhileStatement',
      key: 'test',
      index: null,
    },
    {
      source: 'if (a satisfies T) {}',
      parent: 'IfStatement',
      key: 'test',
      index: null,
    },
    { parent: 'CallExpression', key: 'arguments', source: 'f(a!)', index: 0 },
    {
      parent: 'CallExpression',
      source: 'f(b, (<T>a))',
      key: 'arguments',
      index: 1,
    },
    {
      parent: 'VariableDeclarator',
      source: 'let x = a<T>',
      key: 'init',
      index: null,
    },
    {
      source: 'let x = ((a as unknown) as T)!',
      parent: 'VariableDeclarator',
      key: 'init',
      index: null,
    },
    { parent: 'BinaryExpression', source: 'a + b', key: 'left', index: null },
    { parent: 'CallExpression', source: '(a)()', key: 'callee', index: null },
  ])(
    'finds the slot of a in $source through wrappers',
    ({ source, parent, index, key }) => {
      let { tree, find } = createTestFile(source)

      let slot = getContextSlot(tree, find('Identifier', 'a'))

      expect(slot).toMatchObject({ parent: { type: parent }, index, key })
    },
  )

  it('returns an empty slot for the program', () => {
    let { tree, find } = createTestFile('a')

    expect(getContextSlot(tree, find('Program', 'a'))).toStrictEqual({
      parent: null,
      index: null,
      key: null,
    })
  })

  it('throws for a node outside the runtime tree', () => {
    let { tree } = createTestFile('a')
    let other = createTestFile('a')

    expect(() => getContextSlot(tree, other.find('Identifier', 'a'))).toThrow(
      new Error('Node is not part of the runtime tree of the file.'),
    )
  })
})
